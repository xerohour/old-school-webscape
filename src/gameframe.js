import { pixelIcon } from "./pixelart.js";
import { bakedURL } from "./baked.js";
import { RenderOptions } from "./renderopts.js";

/* ===========================================================================
   gameframe.js — the classic 765x503 "fixed mode" game frame.
   Every interface element is authored against a 765x503 window (the real 2007
   client's fixed-mode canvas) and laid out here, in *frame pixels*. The frame
   is drawn from src/sprites/ui/frame.png — a 1:1 atlas of the actual interface
   sprites pulled out of the 2007 game cache by src/tools/cache-bake/frame.mjs,
   which also records where each sprite belongs (frame.json's `layout`).

   The whole frame is then scaled to the browser window with a CSS transform, so
   children can be positioned in frame pixels and DOM text scales with it. Two
   consequences worth knowing:

     * The 3D canvas is sized 512x334 in CSS pixels and upscaled by the frame
       transform, exactly like the real client (fixed mode upscales its whole
       765x503 canvas), so the world and the canvas-drawn hitsplats stay
       period-accurate instead of turning into crisp modern pixels.
     * DOM text does NOT get upscaled — the bitmap fonts are real TrueType
       outlines (src/fonts.css) whose glyphs are one axis-aligned rectangle per
       lit source pixel, so at a 2x frame scale they render as exact 2x2 blocks.
       That is pixel-identical to the client blitting its bitmap font at 2x.

   Layers, back to front: frame chrome, the 3D viewport, the minimap (canvas +
   compass under the minimap frame sprite), the tab rows, the side panel, the
   chatbox, and finally menus/modals which scale with everything else.
   =========================================================================== */

const ATLAS_URL = "src/sprites/ui/frame.png";
const INDEX_URL = "src/sprites/ui/frame.json";

export const FRAME_W = 765;
export const FRAME_H = 503;

/* The 3D viewport, and the interface regions inside the frame. */
export const VIEWPORT = { x: 4, y: 4, w: 512, h: 334 };
export const MAP = { x: 550, y: 4, w: 172, h: 156, cx: 97, cy: 80, r: 71 };
export const COMPASS = { x: 550, y: 4, cx: 15.5, cy: 16.5, r: 16 };
export const SIDE = { x: 553, y: 205, w: 190, h: 261 };
export const CHAT = { x: 17, y: 357, w: 479, h: 96 };
export const CHAT_TEXT = { x: 0, y: 0, w: 463, h: 77 };
export const CHAT_INPUT = { x: 0, y: 78, w: 463, h: 18 };
export const CHAT_SCROLL = { x: 463, y: 0, w: 16, h: 77 };

/* The localStorage key remembering that the player has dismissed the
   "rotate your phone" line a portrait phone shows under the frame (see
   `_build`). A platform-wide setting would be overkill for one line, and this
   one has to survive a reload. */
const ROTATE_HINT_KEY = "osw:rotatehint";
/* Split private chat's lines above the chatbox: the last five private lines in
   the client's 14px chat face, newest closest to the box (see setChatSplit). */
export const CHAT_SPLIT_H = 28;
const PRIV_ABOVE_LINES = 5;
const PRIV_ABOVE_H = PRIV_ABOVE_LINES * 14;
export const CHAT_BUTTONS = { x: 0, y: 453, w: 496, h: 50 };

/* ------------------------------------------------------------- the device

   What kind of thing this game is being played on, worked out once at boot and
   then used by both halves of the frame's mobile behaviour. The test is
   deliberately about the *pointer*, not the user agent: a Windows laptop with a
   touchscreen reports touches but is driven with a mouse, and treating it as a
   phone would zoom its chatbox for no reason. UA parsing is only used for the
   two things a pointer cannot tell us:

     * `mobile` - a phone or tablet, i.e. a device whose on-screen keyboard
       takes a serious slice of the screen and which therefore has to be lifted
       clear of it (see `keyboardInset`).
     * `browser` - who is rendering the frame, because Android browsers all do
       *text autosizing* differently and Samsung Internet's is the most
       aggressive (see src/style.css's `-webkit-text-size-adjust`).

   `model` is the Android device name out of the UA ("SM-S938B" on a Galaxy S25
   Ultra). Nothing branches on it - the viewport already says everything a
   layout needs, and a model string is not a capability - but it is kept because
   it is the only piece of a real device's identity the web exposes, and it is
   what a bug report from a player should carry. */
function detectDevice() {
  const ua = navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  const android = /Android/.test(ua);
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const touch = coarse || (navigator.maxTouchPoints || 0) > 0;
  const mobile = ios || (android && /Mobile/.test(ua)) || (/Windows Phone|IEMobile/.test(ua));
  const browser = /SamsungBrowser/i.test(ua) ? "samsung"
    : /Firefox\/|FxiOS/i.test(ua) ? "firefox"
      : /EdgA?\//i.test(ua) ? "edge"
        : /CriOS|Chrome\//i.test(ua) ? "chrome"
          : /Safari\//i.test(ua) ? "safari" : "other";
  const model = (ua.match(/Android [^;]*;\s*([^;)]+?)(?:\s+Build|\)|;)/) || [])[1] || "";
  return { touch, ios, android, mobile, coarse, browser, model, ua };
}

export const DEVICE = detectDevice();

/* An extra pixel of air around the zoomed chatbox while typing, and how much
   bigger than the fitted scale that zoom is allowed to get (a phone in
   landscape must not blow the frame up to the size of the screen). */
const TYPING_MARGIN = 6;
const TYPING_MAX = 1.8;

/* How long the frame takes to slide from the fitted view to the typing zoom and
   back. Short enough to read as a flick of the camera. The tween is driven from
   requestAnimationFrame (see `_moveTo`) rather than by a CSS transition: a
   transition runs on the *document timeline*, which is frozen while the page is
   hidden - and a frozen transition leaves `transform` pinned to its pre-change
   value, so the frame would never actually move. (The editor's preview iframe
   reports `document.hidden === true`, which is how this was found; rAF keeps
   ticking either way.) */
const TWEEN_MS = 170;

/* The four buttons along the bottom of the chatbox. Each label is drawn
   centred on `x`, with the current mode 13px lower (the client's own layout:
   drawCentredText("Public chat", 55, 28) / ("On", 55, 41), and the single-line
   "Report abuse" sits between the two at 33). The client's `y` is a *baseline*
   and our bitmap web font sits one pixel above the client's cell bottom, so
   the boxes below are `y - 1 - 8.8` (8.8 = the font's baseline offset in a
   12px line box, see pxText). */
export const CHAT_MODES = [
  { key: "public", label: "Public chat", x: 55, labelY: 18, modeY: 31, modes: [["On", "#00ff00"], ["Friends", "#ffff00"], ["Off", "#ff0000"], ["Hide", "#00ffff"]] },
  { key: "private", label: "Private chat", x: 184, labelY: 18, modeY: 31, modes: [["On", "#00ff00"], ["Friends", "#ffff00"], ["Off", "#ff0000"]] },
  { key: "trade", label: "Trade/compete", x: 324, labelY: 18, modeY: 31, modes: [["On", "#00ff00"], ["Friends", "#ffff00"], ["Off", "#ff0000"]] },
  { key: "report", label: "Report abuse", x: 458, labelY: 23, modeY: 31, modes: null },
];

/* The selected-tab stone sprite for each stone width. */
const STONE_PARTS = { 305: "tabStoneFarLeft", 306: "tabStoneMiddleLeft", 307: "tabStoneMiddle" };

/* Our own tab art (src/pixelart.js): a tab whose `customIcon` names one of
   these is drawn from that pixel grid instead of the atlas. The message board's
   speech bubble is the only one - the cache's sheet has a house on that tab,
   and a house is not a chat. */
const CUSTOM_TAB_ICONS = { boardBubble: "boardBubble" };

/* The orb sprites, and the two states the run orb's fill and icon switch
   between. The geometry they are placed with lives in the bake (frame.json's
   `orbs`), because it comes from the cache's interface 548. */
const ORB_FILL = { hp: "orbHp", pray: "orbPray", run: "orbRun" };
const ORB_ICON = { hp: "orbHpIcon", pray: "orbPrayIcon", run: "orbWalkIcon" };
export const ORB_RUN_ICON = { on: "orbRunIcon", off: "orbWalkIcon" };
export const ORB_RUN_FILL = { on: "orbRunOn", off: "orbRun" };
export const ORB_HP_FILL = { normal: "orbHp", poison: "orbHpPoison", disease: "orbHpDisease" };

/* The fourteen sidebar tabs, in the client's own order: seven along the top of
   the side panel, seven along the bottom of the screen. `icon` names a part of
   the baked atlas (`sideiconN` is one frame of the 14-frame sideicons sprite,
   identified frame by frame against the real client's draw calls).

   One icon is not a frame of that sprite: `sideiconOnline` is the green smiling
   face this build's "Players Online" tab shows, a recolour of the friends
   tab's own gold smiley generated by the bake (see CUSTOM_ICONS in
   src/tools/cache-bake/frame.mjs). It replaces the red frowning ignore-list
   face the client keeps on that slot, because that tab lists the players who
   are online here rather than names you never want to hear from - see
   src/ui.js#renderOnlinePlayers. */
export const TABS = [
  { id: 0, row: "top", slot: 0, icon: "sideicon0", name: "Combat Styles" },
  { id: 1, row: "top", slot: 1, icon: "sideicon1", name: "Skills" },
  { id: 2, row: "top", slot: 2, icon: "sideicon2", name: "Quest List" },
  { id: 3, row: "top", slot: 3, icon: "sideicon3", name: "Inventory" },
  { id: 4, row: "top", slot: 4, icon: "sideicon4", name: "Worn Equipment" },
  { id: 5, row: "top", slot: 5, icon: "sideicon5", name: "Prayer" },
  { id: 6, row: "top", slot: 6, icon: "sideicon6", name: "Magic" },
  { id: 7, row: "bottom", slot: 0, icon: "sideicon13", customIcon: "boardBubble", name: "Message Board" },
  { id: 8, row: "bottom", slot: 1, icon: "sideicon7", name: "Friends List" },
  { id: 9, row: "bottom", slot: 2, icon: "sideiconOnline", name: "Players Online" },
  { id: 10, row: "bottom", slot: 3, icon: "sideicon9", name: "Logout", button: true },
  { id: 11, row: "bottom", slot: 4, icon: "sideicon10", name: "Options", button: true },
  { id: 12, row: "bottom", slot: 5, icon: "sideicon11", name: "Emotes" },
  { id: 13, row: "bottom", slot: 6, icon: "sideicon12", name: "Music Player" },
];

export const DEFAULT_TAB = 3;

/* The four interface fonts, and the size each must be rendered at for one CSS
   pixel to equal one source pixel (see src/tools/cache-bake/webfont.mjs). The
   ids are the cache's own: 494 plain11, 495 plain12, 496 bold12, 497 quill8. */
export const FONT = {
  plain11: { family: "rs-plain11", size: 10 },
  plain12: { family: "rs-plain12", size: 12 },
  bold12: { family: "rs-bold12", size: 12 },
  quill8: { family: "rs-quill8", size: 15 },
};

const LAYER_Z = { chrome: 1, viewport: 2, map: 3, tabs: 4, side: 5, chat: 6, overlay: 9 };

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

function place(e, x, y, w, h) {
  e.style.left = x + "px";
  e.style.top = y + "px";
  if (w != null) e.style.width = w + "px";
  if (h != null) e.style.height = h + "px";
  return e;
}

/* -------------------------------------------------------------- scrollbars

   Every scrollbar in this build is the client's one routine:
   `renderChatInterface(x, y, height, scrollPosition, scrollMaximum)`. The
   chatbox calls it directly (line 3395 of the reference client) and the
   interface renderer calls it for any child of type 0 that overflows, at
   `x + childInterface.width` (line 3981) - so the chat log, the side panel, the
   bank, the shop and a skill guide are all this one widget.

   It blits exactly two sprites - the up and down arrows, loaded from the media
   archive's "scrollbar" group, frames 0 and 1 (line 9600) - and draws
   everything else *procedurally*: a flat track rectangle and a grip that is a
   single filled rectangle with a 2px bevel, in four hard-coded colours. The
   three-part `SCROLLBAR_THUMB_TOP/MIDDLE/BOTTOM` art that index 8 also carries
   is not what this revision draws, so nothing here blits it (see README,
   "Scrollbars"). */
export const SCROLLBAR_COLORS = {
  track: "#23201b",     /* SCROLLBAR_TRACK_COLOUR */
  grip: "#4d4233",      /* SCROLLBAR_GRIP_FOREGROUND */
  highlight: "#766654", /* SCROLLBAR_GRIP_HIGHLIGHT */
  lowlight: "#332d25",  /* SCROLLBAR_GRIP_LOWLIGHT */
};

/* Where the grip goes and how long it is, in the client's own integer
   arithmetic:

     length = (height - 32) * height / scrollMaximum, at least 8
     offset = (height - 32 - length) * scrollPosition / (scrollMaximum - height)

   `height` is the scroll window's height and `scrollMaximum` the height of
   everything inside it, so `scrollMaximum - height` is as far as it can scroll.
   Both divisions truncate in Java, hence the `floor`s - and note that the
   length is scaled by the *window* height rather than by the track height: that
   is the client's formula, transcribed, not a simplification of it. */
export function scrollbarGrip(height, scrollMax, position) {
  const track = height - 32;
  const content = Math.max(1, scrollMax || 0);
  const length = Math.max(8, Math.floor((track * height) / content));
  const travel = Math.max(1, content - height);
  const offset = Math.max(0, Math.min(track - length, Math.floor(((track - length) * position) / travel)));
  return { track, length, offset };
}

/* Paint a grip the way the client paints one. The four colours are drawn as
   *line pairs over the fill*, lowlight last, so a mitred CSS bevel is wrong at
   two pixels: the client leaves (14,0) as highlight (its lowlight column starts
   a row lower) and (0, length-2) as highlight (its lowlight row starts a column
   further right, so the bottom-left stays highlight until the last row). Those
   two are patched back in by hand. */
export function paintGrip(grip) {
  grip.style.background = SCROLLBAR_COLORS.grip;
  grip.style.boxShadow =
    "inset 2px 2px 0 " + SCROLLBAR_COLORS.highlight +
    ", inset -2px -2px 0 " + SCROLLBAR_COLORS.lowlight;
  const patch = (left, off, fromBottom) => {
    const d = document.createElement("div");
    d.className = "gripPatch";
    d.style.background = SCROLLBAR_COLORS.highlight;
    d.style.left = left + "px";
    if (fromBottom) d.style.bottom = off + "px";
    else d.style.top = off + "px";
    grip.appendChild(d);
    return d;
  };
  patch(14, 0);
  patch(0, 2, true);
  return grip;
}

export const Frame = {
  ready: false,
  scale: 1,
  fit: 1,
  viewW: 0,
  viewH: 0,
  typing: false,
  typingScaleValue: 0,
  _tf: null,
  _tweenRaf: 0,
  _from: null,
  _to: null,
  _t0: 0,
  host: null,
  root: null,
  atlas: null,
  parts: {},
  layout: {},
  layers: {},
  tabs: [],
  els: {},
  _onResize: [],
  _lastNotified: 0,
  _tabSelect: null,
  _selectedTab: DEFAULT_TAB,

  /* The one URL the atlas is ever fetched from, for the <img> above and for the
     `.spr`/`.tilebg` backgrounds alike.

     The stylesheet used to carry a literal `url("sprites/ui/frame.png")` while
     this module loaded the *versioned* URL, and those are two different cache
     keys: the browser fetched the whole 588 KB atlas twice on every cold load
     (two resource entries, both 588 KB, one `img` and one `css`), and after a
     re-bake the two could even be different generations of the file - the
     versioned copy fresh, the stylesheet's copy whatever the HTTP cache still
     held. Injecting the rule here is what makes them one: same absolute URL,
     same fetch, same generation, and the `?v=` that `bakedURL` adds keeps a
     re-bake reaching existing players (the reason the URL is versioned at all;
     see tools/cache-bake/README.md).

     It is injected rather than templated into the stylesheet because the version
     lives in src/baked.js, which only the modules can read. It carries the full
     `.spr, .tilebg` selector so nothing that relied on the old rule loses its
     background, and it must be in the document before `_build` makes the first
     `.spr`. */
  _injectAtlasRule() {
    if (this._atlasRule) return;
    const s = document.createElement("style");
    s.id = "frameAtlasRule";
    s.textContent = '.spr, .tilebg { background-image: url("' + bakedURL(ATLAS_URL) + '"); }';
    document.head.appendChild(s);
    this._atlasRule = s;
  },

  async init(host) {
    this.host = host || document.getElementById("frameHost");
    this._injectAtlasRule();
    const [index, atlas] = await Promise.all([
      fetch(bakedURL(INDEX_URL), { cache: "force-cache" }).then((r) => r.json()),
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = bakedURL(ATLAS_URL);
      }),
    ]);
    this.atlas = atlas;
    for (const p of index.parts) this.parts[p.name] = p;
    for (const [name, x, y] of index.layout) this.layout[name] = { x, y };
    this.tabRows = index.tabRows;
    this.index = index;

    this._build();
    this.setScale();
    this._watchViewport();
    this._markDevice();
    this.ready = true;
    return this;
  },

  /* The device class on <body>, so the stylesheet can answer a phone
     differently from a desktop without any of it being decided twice (see
     src/style.css: the touch-sized hit areas, the chat line's own font, and the
     Android text-autosizing opt-out). */
  _markDevice() {
    const b = document.body;
    if (!b || !b.classList) return;
    b.classList.add("device-" + (DEVICE.mobile ? "mobile" : DEVICE.touch ? "touch" : "desktop"));
    if (DEVICE.touch) b.classList.add("touch");
    if (DEVICE.ios) b.classList.add("ios");
    if (DEVICE.android) b.classList.add("android");
    if (DEVICE.browser !== "other") b.classList.add("browser-" + DEVICE.browser);
    if (DEVICE.model) b.dataset.deviceModel = DEVICE.model;
  },

  /* ---------------------------------------------------------------- sprites */

  /* A div showing one atlas sprite, already placed if it has a layout entry. */
  sprite(name, parent) {
    const p = this.parts[name];
    if (!p) {
      console.warn("gameframe: no such sprite part:", name);
      return null;
    }
    const d = el("div", "spr", parent);
    d.style.width = p.w + "px";
    d.style.height = p.h + "px";
    d.style.backgroundPosition = -p.x + "px " + -p.y + "px";
    d.dataset.part = name;
    const at = this.layout[name];
    if (at) place(d, at.x, at.y);
    return d;
  },

  /* Draw an atlas sprite into a 2d context (for canvases: the minimap markers,
     hitsplat-adjacent icons, inventory items, ...). */
  drawSprite(ctx, name, x, y, w, h) {
    const p = this.parts[name];
    if (!p) return;
    if (w == null) { w = p.w; h = p.h; }
    ctx.drawImage(this.atlas, p.x, p.y, p.w, p.h, x, y, w, h);
  },

  /* The atlas file itself, for callers that paint their own backing from it
     (src/ui.js#plateBacking crops one plate cell out of it). */
  atlasURL() {
    return bakedURL(ATLAS_URL);
  },

  /* The atlas sprite as an <img>-able source, for CSS background use. */
  spriteURL(name) {
    const p = this.parts[name];
    if (!p) return null;
    return { url: bakedURL(ATLAS_URL), x: p.x, y: p.y, w: p.w, h: p.h };
  },

  /* Point an element's background at one atlas sprite (no positioning - the
     caller keeps whatever layout it wants). */
  bg(e, name) {
    const p = this.parts[name];
    if (!e || !p) {
      if (e) console.warn("gameframe: no such sprite part:", name);
      return null;
    }
    e.style.backgroundPosition = -p.x + "px " + -p.y + "px";
    e.style.width = p.w + "px";
    e.style.height = p.h + "px";
    e.dataset.part = name;
    return p;
  },

  /* As bg(), but the element also becomes an absolutely-positioned overlay
     sprite - used for the ornaments and buttons that sit on a fixed spot. */
  setBg(e, name) {
    const p = this.bg(e, name);
    if (p) e.classList.add("spr");
    return p;
  },

  /* ------------------------------------------------------------- geometry */

  /* Pointer (client) coordinates -> frame pixels. UI that positions menus and
     tooltips needs this, since the frame is displayed with a CSS scale. */
  toFrame(clientX, clientY) {
    const r = this.root.getBoundingClientRect();
    const s = r.width / FRAME_W || 1;
    return { x: (clientX - r.left) / s, y: (clientY - r.top) / s };
  },

  fromFrame(x, y) {
    const r = this.root.getBoundingClientRect();
    const s = r.width / FRAME_W || 1;
    return { x: r.left + x * s, y: r.top + y * s };
  },

  /* ----------------------------------------------------------------- scale */

  setScale() {
    const w = this.host.clientWidth || window.innerWidth;
    /* Two heights, and both matter. `hostH` is the box the frame is *laid out*
       in; `h` is what the frame may be *fitted* to, which the visual viewport
       can only lower (see below). `hostOffsetY` re-centres the frame inside the
       difference between them, so a change to the host's own height has to
       count as a change even when the fitted height does not - otherwise an
       engine without `dvh` that grows its layout viewport leaves the frame
       centred for the old box. */
    const hostH = this.host.clientHeight || window.innerHeight;
    let h = hostH;
    /* The host's own box is the truth (see the `#frameHost` rule in style.css -
       it is sized in `dvh`, the part of the viewport really on screen), but a
       browser without dynamic viewport units would hand us the *layout* height,
       which in landscape is taller than the screen and would scale the frame so
       that its bottom - the chatbox - sits under the browser's URL bar. So the
       height is capped by the visual viewport as well, which is the one number
       that always means "what the player can see".
       Two cases are deliberately let through:
         * a **pinch zoom** (`scale > 1`) shrinks the visual viewport but is the
           player zooming the *page*, not a smaller screen - re-fitting the frame
           to it would fight the zoom;
         * **while typing** the keyboard is what shrank it, and the keyboard is
           handled by the typing zoom (`setTyping`), which positions the frame
           against `visibleHeight()` itself. Re-fitting here would shrink the
           whole interface every time the chat line was focused. */
    const vv = window.visualViewport;
    if (vv && vv.height && !this.typing && !(vv.scale > 1.01)) {
      h = Math.min(h, Math.round(vv.height));
    }
    const fit = Math.min(w / FRAME_W, h / FRAME_H);
    /* The grid that keeps the interface's own squares exact is one *screen*
       pixel: an interface square has to be a whole number of them, which is this
       scale times the display's ratio - not a whole number of CSS pixels, which
       is only the same thing on a ratio-1 display. A ratio-2 display is also
       exact at 0.5 and 1.5; a ratio-1.25 display (a 125% OS scale) is exact at
       0.8, 1.6, 2.4 and never at 1 or 2. src/sharp.js#paint draws the text from
       that same product, so a frame sitting on this grid is the one that lets the
       glyph masks through untouched.
       `RenderOptions.frameZoom` (the additional-settings window) picks the shape:
       "exact" takes that grid always (up to one step smaller than the window,
       with the page's own background around it); "full" scales to cover the
       window instead, cropping the overflow; "fit" fills the window and the
       masks are resampled smoothly instead (the strokes keep their weight but
       soften at the edges - see sharp.js#paint), except that a grid scale is
       still taken when it costs no more than ~8% of the viewport. Below 1:1
       there is no whole number of screen pixels to take, so a phone keeps the
       fitted scale either way. Tiled-sprite seams at fractional scales are
       handled structurally instead (a seamless plate backing under the wall,
       src/ui.js#plateBacking), so the fill stays resizable. */
    const ratio = window.devicePixelRatio || 1;
    const steps = Math.floor(fit * ratio + 1e-6);
    const gridScale = steps / ratio;
    const mode = RenderOptions.frameZoom || "fit";
    const s = mode === "full" ? Math.max(w / FRAME_W, h / FRAME_H)
      : steps >= 1 && (mode === "exact" || gridScale >= fit * 0.92) ? gridScale : fit;
    const changed = s !== this.scale || w !== this.viewW || h !== this.viewH || hostH !== this.hostH;
    this.scale = s;
    this.fit = fit;
    this.viewW = w;
    this.viewH = h;
    this.hostH = hostH;
    if (!changed && !this.typing) return;
    this._applyTransform();
    this._updateRotateHint();
    if (s !== this._lastNotified) {
      this._lastNotified = s;
      for (const fn of this._onResize) fn(s);
    }
  },

  /* The portrait line under the frame (see `_build`). It shows only where it is
     true and useful: a *phone* (not a tablet, not a desktop) whose screen is
     upright and whose spare room is worth mentioning - the frame's own drawn
     height below 60% of the screen. A desktop browser dragged into a narrow
     window is portrait too, and gets nothing, because a mouse and a keyboard do
     not care which way the window is. */
  _updateRotateHint() {
    const h = this.rotateHint;
    if (!h) return;
    const portrait = this.viewH > this.viewW;
    const spare = this.scale * FRAME_H < this.viewH * 0.6;
    h.hidden = !(DEVICE.mobile && portrait && spare && !this.rotateHintOff);
  },

  /* The frame's own transform, which is either the plain centred fit or - on a
     touch device, while the chat line has the keyboard - a zoom onto the
     chatbox (see `setTyping`). Both forms are written here and nowhere else,
     because `setScale` and `setTyping` both have to be able to override the
     other and an inline transform beats the stylesheet.

     Both are the same shape - `translate(t) scale(s)` about the frame's centre,
     with the frame's own box left at the middle of the screen by the stylesheet
     - so that the two can be *interpolated* (`_moveTo` slides between them on a
     requestAnimationFrame tween, which is what makes the typing zoom feel like
     the camera leaning in rather than the game jumping - not a CSS transition,
     for the reason spelled out at TWEEN_MS). The centred fit is the translate
     that maps the frame's centre onto the viewport's centre: (-w/2, -h/2). The
     typing form solves the same equation for "the left end of the chat strip
     (the chat-mode stones, frame x=0) lands at TYPING_MARGIN from the left of
     the screen and the chatbox's input line just above the keyboard". */
  _applyTransform(animate = true) {
    const root = this.root;
    if (!root) return;
    const cx = FRAME_W / 2, cy = FRAME_H / 2;
    let tx, ty, s;
    if (this.typing) {
      const box = this._chatBox();
      s = this.typingScaleValue = this.typingScale(box);
      tx = TYPING_MARGIN - this.viewW / 2 - cx - s * (box.left - cx);
      /* The vertical position: as high as the keyboard demands, but never
         lower than the centred frame would sit - with no keyboard to lift
         clear of (a tablet, a measured zero), the zoom must not drag the whole
         game down the screen just to put the chatbox on the floor. */
      const want = this.visibleHeight() - TYPING_MARGIN - this.viewH / 2 - cy - s * (CHAT.y + CHAT.h - cy);
      ty = Math.min(want, -cy);
    } else {
      this.typingScaleValue = 0;
      s = this.scale; tx = -cx; ty = -cy;
      ty -= this.hostOffsetY();
    }
    root.style.transformOrigin = "center center";
    this._moveTo(tx, ty, s, animate);
  },

  /* Write the transform, sliding there over TWEEN_MS when asked. `_tf` is the
     transform actually on screen right now - not the one we last asked for - so
     a second move mid-tween (a viewport still reporting the keyboard sliding
     in) starts from where the frame visibly is. */
  _moveTo(tx, ty, s, animate = true) {
    const root = this.root;
    if (!root) return;
    const cur = this._tf;
    if (!cur || !animate || (cur.tx === tx && cur.ty === ty && cur.s === s)) {
      this._stopTween();
      this._tf = { tx, ty, s };
      root.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      return;
    }
    this._from = { tx: cur.tx, ty: cur.ty, s: cur.s };
    this._to = { tx, ty, s };
    this._t0 = performance.now();
    if (!this._tweenRaf) this._tweenRaf = requestAnimationFrame(() => this._tweenStep());
  },

  _tweenStep() {
    this._tweenRaf = 0;
    const a = this._from, b = this._to;
    if (!a || !b) return;
    const k = Math.min(1, (performance.now() - this._t0) / TWEEN_MS);
    /* ease-in-out: the curve a CSS transition would have drawn */
    const e = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
    const tx = a.tx + (b.tx - a.tx) * e;
    const ty = a.ty + (b.ty - a.ty) * e;
    const s = a.s + (b.s - a.s) * e;
    this._tf = { tx, ty, s };
    if (this.root) this.root.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    if (k < 1) this._tweenRaf = requestAnimationFrame(() => this._tweenStep());
    else { this._tf = { tx: b.tx, ty: b.ty, s: b.s }; this._from = this._to = null; }
  },

  _stopTween() {
    if (this._tweenRaf) { cancelAnimationFrame(this._tweenRaf); this._tweenRaf = 0; }
    this._from = this._to = null;
  },

  /* How tall the screen really is *right now*: with a keyboard up it is the
     part above it, not the layout viewport. `keyboardInset` is what the
     platform says (measured on the visual viewport) with a mobile-sized guess
     behind it for the platforms that say nothing - mobile Safari does not
     shrink an iframe's visual viewport when the keyboard opens, and a chatbox
     floating a little high is readable where a covered one is not. */
  visibleHeight() {
    return Math.max(120, this.viewH - this.keyboardInsetNow());
  },

  /* Half of the part of the host box that is off screen. The host is sized in
     `dvh` (style.css#frameHost), so this is 0 on every engine that has the
     dynamic viewport units, and 0 when the host really is the screen. It is the
     other half of the safety net `setScale` opens with: on an engine that has
     neither, `host.clientHeight` can include the browser's URL bar, and the
     frame would then be fitted to the screen (`viewH` capped by the visual
     viewport) and still *centred in the taller box*, which pushes its bottom -
     the chatbox and the inventory - off the visible area even though the scale
     is right. Shifting the centred frame up by half the excess puts it back in
     the middle of what the player can see. */
  hostOffsetY() {
    const h = this.hostH || this.host.clientHeight || window.innerHeight;
    return Math.max(0, (h - this.viewH) / 2);
  },

  keyboardInsetNow() {
    if (!this.typing) return 0;
    let inset = 0;
    const vv = window.visualViewport;
    if (vv) inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    /* a plausible keyboard is a real slice of the screen and not most of it:
       anything else is the viewport reporting something we did not ask about */
    if (inset >= 60 && inset <= this.viewH * 0.75) return inset;
    if (!DEVICE.mobile) return 0;
    return Math.max(0, Math.min(this.viewH * 0.42, this.viewH - 180));
  },

  /* What the typing zoom has to fit: the chat-mode button strip *and* the
     chatbox. The strip starts at frame x=0 - seventeen pixels to the left of
     the chatbox, because the client's "Public chat" stone hangs off the left of
     the message window - so fitting the chatbox alone would push the first
     stone off the left of the screen. Both numbers come out of the baked atlas
     (CHAT_BUTTONS/the `chatButtons` part) rather than being assumed, and the
     strip's own 496 is the true drawn width: the per-button 124px hit boxes
     overhang it, but nothing is *painted* outside it. */
  _chatBox() {
    const strip = this.parts.chatButtons;
    const left = Math.min(CHAT.x, CHAT_BUTTONS.x);
    const stripRight = CHAT_BUTTONS.x + (strip ? strip.w : CHAT_BUTTONS.w);
    return { left, right: Math.max(CHAT.x + CHAT.w, stripRight) };
  },

  typingScale(box = this._chatBox()) {
    const s = Math.min(
      (this.viewW - TYPING_MARGIN * 2) / (box.right - box.left),
      (this.visibleHeight() - TYPING_MARGIN * 2) / CHAT.h,
      this.fit * TYPING_MAX,
    );
    return Math.max(this.fit, s);
  },

  /* The chat line has (or has lost) the keyboard. This used to zoom the
     frame onto the chatbox on touch devices; the zoom is gone (the chatbox
     keeps its size while typing), so this is a no-op that keeps its callers. */
  setTyping(on) {
    return false;
    const next = !!on;
    if (next === this.typing) {
      if (next) this._applyTransform();
      return false;
    }
    this.typing = next;
    if (this.root) this.root.classList.toggle("typing", next);
    this._applyTransform();
    return true;
  },

  /* The screen can change size without the browser ever telling us: a preview
     inside another page, a phone whose URL bar slides away, a keyboard opening
     on a platform that only reports it through the visual viewport. So the
     size is checked on a slow timer as well as on the events, and the two agree
     by construction - `setScale` is a no-op when nothing has changed. */
  _watchViewport() {
    const check = () => this.setScale();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => {
        if (this.typing) this._applyTransform();
        check();
      });
      window.visualViewport.addEventListener("scroll", () => { if (this.typing) this._applyTransform(); });
    }
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
    const last = { w: 0, h: 0, rawH: 0 };
    setInterval(() => {
      const w = this.host.clientWidth || window.innerWidth;
      /* The same two measurements `setScale` takes: the fitted height (capped by
         the visual viewport, because on a browser whose host box does not follow
         the URL bar, the thing that changes when the bar hides is the visual
         viewport alone) and the host's own raw height (which decides where in
         the box the frame is centred). */
      const rawH = this.host.clientHeight || window.innerHeight;
      let h = rawH;
      const vv = window.visualViewport;
      if (vv && vv.height && !this.typing && !(vv.scale > 1.01)) h = Math.min(h, Math.round(vv.height));
      if (w === last.w && h === last.h && rawH === last.rawH) return;
      last.w = w; last.h = h; last.rawH = rawH;
      check();
    }, 250);
  },

  onResize(fn) {
    this._onResize.push(fn);
    if (this.ready) fn(this.scale);
  },

  /* ------------------------------------------------------------------ tabs */

  onTabSelect(fn) { this._tabSelect = fn; },

  setSelectedTab(id) {
    if (!this.ready) { this._selectedTab = id; return; }
    for (const t of this.tabs) {
      const on = t.id === id;
      t.stone.hidden = !on;
    }
    this._selectedTab = id;
  },

  /* ---------------------------------------------------------- construction */

  _build() {
    const host = this.host;
    host.innerHTML = "";
    const root = el("div", "frame", host);
    root.id = "frame";
    root.style.width = FRAME_W + "px";
    root.style.height = FRAME_H + "px";
    this.root = root;

    /* A phone held upright cannot show this 765x503 interface at a useful size:
       the fit is limited by the ~390 pixels of width, so the frame lands near
       0.5 and leaves the rest of the screen black above and below it. Landscape
       is the shape this interface was drawn for - there the *height* is the
       limit and the frame fills the screen - so on a phone in portrait the
       spare room under the frame carries one line saying so. It is the client's
       own font (no new art), it is dismissible, and the dismissal is
       remembered; nothing else about the layout changes. */
    this.rotateHint = el("div", "rotateHint", host);
    this.rotateHint.innerHTML = "<span>Rotate your phone for a much bigger view</span>";
    const hintX = el("button", "rotateHintX", this.rotateHint);
    hintX.type = "button";
    hintX.setAttribute("aria-label", "Dismiss");
    hintX.textContent = "\u00d7";
    hintX.addEventListener("click", () => {
      this.rotateHintOff = true;
      try { localStorage.setItem(ROTATE_HINT_KEY, "1"); } catch (e) { /* private mode */ }
      this._updateRotateHint();
    });
    try { this.rotateHintOff = localStorage.getItem(ROTATE_HINT_KEY) === "1"; } catch (e) { this.rotateHintOff = false; }

    /* 1. the frame chrome: every layout part except the minimap ring, which
          has to sit above the minimap canvas. */
    const chrome = el("div", "layer chrome", root);
    chrome.style.zIndex = LAYER_Z.chrome;
    this.layers.chrome = chrome;
    for (const [name, x, y] of this.index.layout) {
      if (name === "minimapFrame") continue;
      const d = this.sprite(name, chrome);
      place(d, x, y);
    }

    /* 2. the viewport: the 3D canvas and the effects overlay above it. */
    const viewport = el("div", "layer viewport", root);
    viewport.style.zIndex = LAYER_Z.viewport;
    place(viewport, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h);
    this.layers.viewport = viewport;
    let gameCanvas = document.getElementById("gameCanvas");
    if (!gameCanvas) {
      gameCanvas = el("canvas", null, viewport);
      gameCanvas.id = "gameCanvas";
    } else viewport.appendChild(gameCanvas);
    gameCanvas.width = VIEWPORT.w;
    gameCanvas.height = VIEWPORT.h;
    this.els.canvas = gameCanvas;
    let fxCanvas = document.getElementById("fxLayer");
    if (!fxCanvas) {
      fxCanvas = el("canvas", null, viewport);
      fxCanvas.id = "fxLayer";
    } else viewport.appendChild(fxCanvas);
    this.els.fx = fxCanvas;

    /* 3. the minimap: two canvases (map + compass) drawn under the ring. */
    const map = el("div", "layer map", root);
    map.style.zIndex = LAYER_Z.map;
    place(map, MAP.x, MAP.y, MAP.w, MAP.h);
    this.layers.map = map;
    const mm = el("canvas", null, map);
    mm.id = "minimapCanvas";
    mm.width = MAP.w;
    mm.height = MAP.h;
    place(mm, 0, 0, MAP.w, MAP.h);
    this.els.minimap = mm;
    const cd = Math.ceil(COMPASS.r * 2) + 2;
    const cp = el("canvas", null, map);
    cp.id = "compassCanvas";
    cp.width = cd;
    cp.height = cd;
    place(cp, Math.round(COMPASS.cx - cd / 2), Math.round(COMPASS.cy - cd / 2), cd, cd);
    this.els.compass = cp;
    /* the compass pocket is a button: clicking it swings the camera back to
       north, exactly like the real client */
    const ch = el("div", "compasshit", map);
    ch.id = "compassHit";
    place(ch, Math.round(COMPASS.cx - COMPASS.r), Math.round(COMPASS.cy - COMPASS.r), COMPASS.r * 2, COMPASS.r * 2);
    ch.style.zIndex = 4;
    ch.title = "Compass";
    this.els.compassHit = ch;
    const ring = this.sprite("minimapFrame", map);
    place(ring, 0, 0);
    ring.style.zIndex = 2;
    for (const n of ["minimapEdgeLeft", "minimapEdgeRight"]) {
      const d = this.sprite(n, map);
      place(d, this.layout[n].x - MAP.x, this.layout[n].y - MAP.y);
      d.style.zIndex = 2;
    }

    /* 4. the tab rows. The row sprite already carries the unselected stones;
          a selected-stone sprite and the tab icon go on top of each slot. */
    const tabs = el("div", "layer tabs", root);
    tabs.style.zIndex = LAYER_Z.tabs;
    this.layers.tabs = tabs;
    for (const rowName of ["top", "bottom"]) {
      const row = this.tabRows[rowName];
      const rowEl = el("div", "tabrow", tabs);
      place(rowEl, row.x, row.y);
      if (rowName === "top") this.els.topTabRow = rowEl;
      else this.els.bottomTabRow = rowEl;
      for (let i = 0; i < row.slots.length; i++) {
        const s = row.slots[i];
        const stone = this.sprite(STONE_PARTS[s.stoneId], rowEl);
        if (stone) {
          place(stone, s.stone[0], s.stone[1]);
          /* The client blits the selected-stone sprite with a different flip
             per slot (317_Client.java, drawTabArea): the top row's last three
             slots mirror horizontally, the bottom row's mirror vertically and
             its last three mirror both. The stone sprites have zero offset, so
             a CSS flip of the trimmed frame reproduces it exactly. */
          if (s.flip === "h") stone.style.transform = "scaleX(-1)";
          else if (s.flip === "v") stone.style.transform = "scaleY(-1)";
          else if (s.flip === "hv") stone.style.transform = "scale(-1, -1)";
          stone.hidden = true;
        }
        const tab = TABS.find((t) => t.row === rowName && t.slot === i);
        /* IndexedImage blit adds the frame's trim offsets to the draw x/y
           (Class30_Sub2_Sub1_Sub2.method361), which is why a plain `place` at
           the raw client coordinate would sit the icon off by (offX, offY). */
        const ip = tab ? this.parts[tab.icon] : null;
        let icon = null;
        if (tab && tab.customIcon && CUSTOM_TAB_ICONS[tab.customIcon]) {
          /* Our own art (src/pixelart.js), centred on the tab's stone. The
             client centres every one of its own icons on the stone segment
             rather than on the click box - sideicon13, the house the board
             replaced, is drawn at 542 with its stone at 538-572, and each
             neighbour follows the same rule to the pixel - so a replacement
             that centred on the hit box instead would sit three pixels right of
             every icon beside it, which is what the user saw. The click box is
             35 wide against the stone's 34 and is offset two pixels right, so
             the two are not the same thing. The art carries no trim offsets of
             its own (the cache's icons do), so the stone is all there is to
             centre on. */
          const art = pixelIcon(CUSTOM_TAB_ICONS[tab.customIcon]);
          const stonePart = this.parts[STONE_PARTS[s.stoneId]];
          if (art) {
            icon = el("div", "spr", rowEl);
            icon.style.width = art.w + "px";
            icon.style.height = art.h + "px";
            icon.style.backgroundImage = 'url("' + art.url + '")';
            const sw = stonePart ? stonePart.w : 0;
            const sh = stonePart ? stonePart.h : 0;
            if (sw && sh) place(icon, Math.round(s.stone[0] + (sw - art.w) / 2), Math.round(s.stone[1] + (sh - art.h) / 2));
            else place(icon, s.icon[0], s.icon[1], art.w, art.h);
          }
        } else {
          icon = tab ? this.sprite(tab.icon, rowEl) : null;
          if (icon && ip) place(icon, s.icon[0] + (ip.offX || 0), s.icon[1] + (ip.offY || 0), ip.w, ip.h);
        }
        const hit = el("div", "tabhit", rowEl);
        const h = s.hit;
        if (h) place(hit, h[0] - row.x, h[1] - row.y, h[2], h[3]);
        else place(hit, s.stone[0], s.stone[1], (this.parts[STONE_PARTS[s.stoneId]] || {}).w, (this.parts[STONE_PARTS[s.stoneId]] || {}).h);
        if (tab) {
          hit.addEventListener("click", () => this._selectTab(tab.id));
          this.tabs.push({ id: tab.id, row: rowName, slot: i, stone, icon, hit, name: tab.name });
        }
      }
    }

    /* 5. the side panel interior (the sprite behind it is opaque, so this is
          just a clipped canvas for whatever panel is showing). */
    const side = el("div", "layer side", root);
    side.style.zIndex = LAYER_Z.side;
    place(side, SIDE.x, SIDE.y, SIDE.w, SIDE.h);
    this.layers.side = side;

    /* 6. the chatbox: text area, input line, scrollbar, mode buttons. */
    const chat = el("div", "layer chat", root);
    chat.style.zIndex = LAYER_Z.chat;
    place(chat, CHAT.x, CHAT.y, CHAT.w, CHAT.h);
    this.layers.chat = chat;
    const log = el("div", "chatlog", chat);
    log.id = "chatLog";
    place(log, CHAT_TEXT.x, CHAT_TEXT.y, CHAT_TEXT.w, CHAT_TEXT.h);
    this.els.chatLog = log;
    const name = el("div", "chatname", chat);
    place(name, 4, CHAT_INPUT.y, 0, CHAT_INPUT.h);
    name.style.lineHeight = CHAT_INPUT.h + "px";
    this.els.chatName = name;
    const input = el("input", "chatinput", chat);
    input.id = "chatInput";
    input.type = "text";
    input.maxLength = 160;
    input.autocomplete = "off";
    input.spellcheck = false;
    /* The mobile keyboard's own settings, which are the difference between a
       chat line and a fight with autocorrect on a phone:

         * `enterkeyhint="send"` names the return key. Every soft keyboard draws
           that key, and "Send" is what it does here - it is also what makes
           Gboard/Samsung Keyboard deliver a real Enter keypress rather than
           swallowing it as a completed composition (src/ui.js#initUI sends on
           it, and on `keypress` as a fallback).
         * `autocapitalize="sentences"` - the mobile default, said out loud
           because Samsung Internet is not always the default.
         * `inputmode="text"` keeps the letter keyboard up: without it some
           Android IMEs start in a numeric/URL mode for an unknown input.
         * `autocorrect` is deliberately left alone (on), which is what a
           phone's keyboard will do anyway - and the one place it is wrong, a
           `::command`, is short enough to retype.

       Also the frame's own typing zoom: focusing the chat line on a touch
       device scales the frame onto the chatbox so the line is readable and the
       keyboard has room (src/gameframe.js#setTyping). */
    input.enterKeyHint = "send";
    input.setAttribute("autocapitalize", "sentences");
    input.setAttribute("inputmode", "text");
    place(input, 0, CHAT_INPUT.y, CHAT_INPUT.w, CHAT_INPUT.h);
    this.els.chatInput = input;
    const sb = this._buildScrollbar(chat, CHAT_SCROLL, (frac) => {
      if (this.els.onChatScroll) this.els.onChatScroll(frac);
    }, 0.02);
    this.els.chatScroll = sb;
    /* The retired in-chatbox split window and its rule: kept hidden by
       setChatSplit (split lines print above the chatbox now). Both are the
       frame's own furniture, laid out here with everything else. */
    const priv = el("div", "chatpriv", chat);
    priv.hidden = true;
    place(priv, CHAT_TEXT.x, CHAT_TEXT.y, CHAT_TEXT.w, CHAT_SPLIT_H);
    this.els.chatPriv = priv;
    this.els.chatPrivInner = el("div", "chatprivInner", priv);
    const privRule = el("div", "chatprivRule", chat);
    privRule.hidden = true;
    place(privRule, CHAT_TEXT.x, CHAT_TEXT.y + CHAT_SPLIT_H, CHAT_TEXT.w, 1);
    this.els.chatPrivRule = privRule;
    const privAbove = el("div", "chatprivabove", chat);
    privAbove.hidden = true;
    place(privAbove, CHAT_TEXT.x, CHAT_TEXT.y - PRIV_ABOVE_H - 24, CHAT_TEXT.w, PRIV_ABOVE_H);
    this.els.chatPrivAbove = privAbove;
    this.els.chatPrivAboveInner = el("div", "chatprivaboveInner", privAbove);
    /* Dialog messages ("Click to continue") take over the chat text area. */
    const dialog = el("div", "chatdialog", chat);
    dialog.id = "chatDialog";
    /* The whole chatbox, input line included - not the 463-wide message window
       CHAT_TEXT describes. A dialogue is drawn as a chatbox *interface* (the
       cache's interfaces 241-244, 228-238 and so on are 479x96 windows), and
       the client reaches the input line only in its final `else` branch, so an
       open dialogue hides it. The level-up "Click here to continue" is centred
       on this same 479px box, as the client centres it on 239. */
    place(dialog, 0, 0, 479, 96);
    dialog.hidden = true;
    this.els.chatDialog = dialog;
    const chatEnter = el("div", "chatenter", chat);
    place(chatEnter, 0, CHAT_INPUT.y - 1, CHAT_TEXT.w, 1);

    const btns = el("div", "layer chatbuttons", root);
    btns.style.zIndex = LAYER_Z.chat;
    place(btns, CHAT_BUTTONS.x, CHAT_BUTTONS.y, CHAT_BUTTONS.w, CHAT_BUTTONS.h);
    this.layers.chatButtons = btns;
    this.els.chatButtons = [];
    for (const m of CHAT_MODES) {
      const b = el("div", "chatmode", btns);
      place(b, m.x - 62, 0, 124, CHAT_BUTTONS.h);
      const l1 = el("div", "cmLabel", b);
      l1.textContent = m.label;
      place(l1, 0, m.labelY, 124, 12);
      b.dataset.key = m.key;
      this.els.chatButtons.push({ key: m.key, el: b, label: l1, mode: null });
    }

    /* 7. the overlay: context menus, hover text, modals. Inside the frame, so
          everything scales with the interface. */
    const overlay = el("div", "layer overlay", root);
    overlay.style.zIndex = LAYER_Z.overlay;
    place(overlay, 0, 0, FRAME_W, FRAME_H);
    this.layers.overlay = overlay;

    /* orbs: hitpoints, prayer and run energy. The 2007 frame has none - they
       arrive with the 2013-era client - but nothing here is invented: every
       sprite and every coordinate comes from the real client, out of the 2014
       cache's own interface 548 (see tools/cache-bake/frame.mjs, ORB_BUTTONS /
       ORB_GEOM, which is also where the atlas parts come from). A button is
       57x34: the left 27px is a stone plate carrying the value, and the right
       26px is the orb itself, the fill sprite rising from the bottom inside it
       with the empty (dark) part of the sphere showing above the fill line. */
    const og = this.index.orbs;
    if (og && this.parts[ORB_FILL.hp]) {
      for (const b of og.buttons) {
        const orb = el("div", "orb", overlay);
        orb.id = b.key + "Orb";
        orb.dataset.key = b.key;
        place(orb, b.x, b.y, og.geom.w, og.geom.h);
        /* the orb window: the 26x26 the fill is drawn inside and clipped to */
        /* draw order is the client's: frame, then the fill window, then the icon,
           then the plate's text on top */
        const frameEl = this.sprite("orbFrame", orb);
        if (frameEl) place(frameEl, 0, 0);
        const win = el("div", "orbWin", orb);
        place(win, og.geom.fill.x, og.geom.fill.y, og.geom.fill.w, og.geom.fill.h);
        const fill = this.sprite(ORB_FILL[b.key], win);
        if (fill) { place(fill, 0, 0); fill.classList.add("orbFill"); }
        /* The hitpoints orb's poison overlay. Interface 548 puts a *second*
           fill sprite in a 13x26 window laid over the fill's own 26x26 one, so
           only the LEFT half of the sphere takes the poison colour while the
           right half keeps the normal (or diseased) fill - which is what the
           live game's poisoned orb looks like. 13 is the cache's own width
           (half of the 26px fill window). */
        let halfWin = null, halfFill = null;
        if (b.key === "hp") {
          const hw = (og.geom.fill.w >> 1);
          halfWin = el("div", "orbWin", orb);
          place(halfWin, og.geom.fill.x, og.geom.fill.y, hw, og.geom.fill.h);
          halfFill = this.sprite(ORB_HP_FILL.poison, halfWin);
          if (halfFill) { place(halfFill, 0, 0); halfFill.classList.add("orbFill"); }
          halfWin.hidden = true;
        }
        const icon = this.sprite(ORB_ICON[b.key], orb);
        const ip = this.parts[ORB_ICON[b.key]];
        if (icon) place(icon, og.geom.fill.x + ip.offX, og.geom.fill.y + ip.offY);
        const txt = el("div", "orbText", orb);
        txt.id = b.key + "Text";
        place(txt, og.geom.text.x, og.geom.text.y, og.geom.text.w, og.geom.text.h);
        this.els[b.key + "Orb"] = orb;
        this.els[b.key + "Frame"] = frameEl;
        this.els[b.key + "Win"] = win;
        this.els[b.key + "Text"] = txt;
        this.els[b.key + "Fill"] = fill;
        this.els[b.key + "Icon"] = icon;
        if (halfWin) { this.els.hpHalfWin = halfWin; this.els.hpHalfFill = halfFill; }
      }
    }

    const lvl = el("div", "levelups", overlay);
    lvl.id = "levelUps";
    this.els.levelUps = lvl;

    const xp = el("div", "xpDrops", overlay);
    place(xp, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h);
    xp.id = "xpDrops";
    this.els.xpDrops = xp;

    const tip = el("div", "hovertip", overlay);
    tip.id = "hoverTip";
    tip.hidden = true;
    this.els.hoverTip = tip;

    /* The performance read-out (`::fps` toggles it, `::perf` prints the same
       numbers into the chat log once). It is our own tool rather than cache art,
       so it sits in the overlay layer and is hidden until asked for; src/ui.js
       owns its text and its clock. */
    const perf = el("div", "perfBox", overlay);
    perf.id = "perfBox";
    perf.hidden = true;
    this.els.perfBox = perf;

    /* The view/online counters. They sit in the bottom-right corner of the game
       viewport - the same place the xp toasts stack, but the toasts are pushed
       to the right side of a full-width column while these are pinned under
       them and never move, so nothing in the world is covered for long. Filled
       in by src/presence.js. */
    const counters = el("div", "counters", overlay);
    place(counters, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h);
    counters.id = "counters";
    const viewsEl = el("span", "ctViews", counters);
    const onlineEl = el("span", "ctOnline", counters);
    this.els.counters = counters;
    this.els.onlineCount = onlineEl;
    this.els.viewCount = viewsEl;

    /* The minigame timer. The counters' own text properties - the client's
       small font, white with a hard 1px shadow - but bottom-LEFT of the
       viewport, and deliberately NOT under the modal dim with the counters:
       the clock runs while a records board is open, so it stays readable. */
    const mgTimer = el("div", "mgTimer", overlay);
    mgTimer.id = "mgTimer";
    mgTimer.hidden = true;
    place(mgTimer, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h);
    this.els.mgTimer = mgTimer;

    const ctx = el("div", "ctxmenu", overlay);
    ctx.id = "ctxMenu";
    ctx.hidden = true;
    this.els.ctxMenu = ctx;

    const ml = el("div", "modallayer", overlay);
    ml.id = "modalLayer";
    ml.hidden = true;
    this.els.modalLayer = ml;
    const mb = el("div", "modalbox", ml);
    mb.id = "modalBox";
    this.els.modalBox = mb;
  },

  _selectTab(id) {
    if (this._tabSelect) this._tabSelect(id);
    else this.setSelectedTab(id);
  },

  /* The chatbox's two message windows, laid out for the "Split private chat"
     option (the client's own option on the options tab, src/ui.js#settings).
     With it off everything shares the public log and the above-box overlay is
     hidden; with it on private messages leave the chatbox entirely and print in
     cyan above it instead, so the public log keeps its full height and is never
     re-laid-out here. The in-box split pane stays hidden either way. */
  setChatSplit(on) {
    const split = !!on;
    if (this._chatSplit === split) return;
    this._chatSplit = split;
    if (this.els.chatPriv) this.els.chatPriv.hidden = true;
    if (this.els.chatPrivRule) this.els.chatPrivRule.hidden = true;
    if (this.els.chatPrivAbove) this.els.chatPrivAbove.hidden = !split;
  },

  /* A RuneScape scrollbar: the two arrow sprites, then the client's own
     procedurally drawn track and grip. `set` is told the scroll window's
     content height as well as the position, because the client's grip length
     and travel are both functions of it (see `scrollbarGrip`), so it cannot be
     worked out from a bare fraction. */
  _buildScrollbar(parent, box, onScroll, arrowStep) {
    const wrap = el("div", "scrollbar", parent);
    place(wrap, box.x, box.y, box.w, box.h);
    const up = this.sprite("scrollUp", wrap);
    place(up, 0, 0);
    const down = this.sprite("scrollDown", wrap);
    place(down, 0, box.h - 16);
    const trackH = box.h - 32;
    /* `pxRect` is the build's absolutely-positioned flat rectangle (style.css);
       a plain div would flow instead and cover the arrows */
    const track = el("div", "pxRect track", wrap);
    place(track, 0, 16, box.w, trackH);
    track.style.background = SCROLLBAR_COLORS.track;
    /* the grip starts sized for a window that cannot scroll, so an unset bar is
       never a zero-height div */
    const grip = paintGrip(place(el("div", "pxRect grip", wrap), 0, 16, box.w, 8));
    let frac = 1;
    let thumbH = 8;
    const api = {
      el: wrap,
      set(visible, f, scrollMax) {
        wrap.hidden = !visible;
        if (!visible) return;
        const content = Math.max(box.h, scrollMax || 0);
        frac = Math.max(0, Math.min(1, f));
        const g = scrollbarGrip(box.h, content, frac * (content - box.h));
        thumbH = g.length;
        grip.style.height = thumbH + "px";
        grip.style.top = (16 + g.offset) + "px";
      },
      onScroll,
    };
    this._scrollbars = this._scrollbars || [];
    this._scrollbars.push(api);
    wrap.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const r = wrap.getBoundingClientRect();
      const y = e.clientY - r.top;
      /* One arrow click moves a fraction of the history: the client's own
         chatbox arrows step through the log a few messages at a time, and a
         step measured as a fraction of everything above the window is the same
         gesture whatever length the log has grown to. The chatbox asks for a
         finer step (0.02) so long logs can be read precisely. */
      const step = arrowStep || 0.05;
      if (y < 16) onScroll(frac - step);
      else if (y > box.h - 16) onScroll(frac + step);
      else {
        const trackH2 = box.h - 32;
        const f = (y - 16) / Math.max(1, trackH2);
        onScroll(f);
      }
    });
    /* The grip can also be dragged, which is the gesture a scrollbar is for.
       The pointer is taken on the grip itself so that a drag that strays off
       the 16px-wide bar keeps working, and the grab offset is remembered so the
       grip does not jump under the cursor when the drag starts. */
    const fracAt = (clientY, grab) => {
      const r = wrap.getBoundingClientRect();
      const y = (clientY - r.top) / (r.height / box.h);
      return Math.max(0, Math.min(1, (y - 16 - (grab || 0)) / Math.max(1, trackH - thumbH)));
    };
    grip.style.pointerEvents = "auto";
    grip.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      const y = (e.clientY - r.top) / (r.height / box.h);
      const grab = y - 16 - (trackH - thumbH) * frac;
      try { grip.setPointerCapture(e.pointerId); } catch (err) {}
      const move = (ev) => onScroll(fracAt(ev.clientY, grab));
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        grip.removeEventListener("pointercancel", up);
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
      grip.addEventListener("pointercancel", up);
    });
    return api;
  },
};

export default Frame;
