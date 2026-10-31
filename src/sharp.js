/* =================================================================== sharp.js

   Pixel-exact interface text.

   The interface is a fixed 765x503 grid of squares (src/gameframe.js#FRAME_W),
   and every other part of it is drawn square-for-square: the UI atlas, the item
   sprites, the minimap and the world canvases all carry
   `image-rendering: pixelated` (`src/style.css`), so at whatever size the frame
   is shown an interface square is a crisp block of screen squares. **Text was
   the one exception.** It is DOM text in the cache's own bitmap fonts
   (`src/fonts.css`), and the browser rasterises a *font* with anti-aliasing at
   whatever fractional size the frame's scale turns it into - so at a frame
   scale of 1.14 a 10px glyph is drawn at 11.4 device pixels of grey-fringed
   outline next to sprites that are hard-edged blocks. The user's report:
   *"you have anti aliasing applied to text, and it shouldnt be ... it should be
   actually just sharp text completely"*.

   Measured, to be sure of that and of the fix: one 24-character line of
   `rs-plain11` drawn at 10px (its own size) has **5** distinct colours on a
   black background, the same line at 14.265px has **83**, and at 20px (an
   integer multiple) **5** again. So a glyph is pixel-exact exactly when its
   size is the design size or a whole multiple of it, and anti-aliased whenever
   it is not - which is *most* viewport sizes, and always on a phone. Drawing
   the same glyph as a **bitmap** (the cache's own mask, blitted with
   `drawImage`) is 100% solid pixels at every one of those sizes. The TTF and the
   bitmap are the same artwork - `src/tools/cache-bake/webfont.mjs` rasterises
   the TTF *from* the bitmap - so nothing is lost by going back to the mask.

   What this module does, then, is what the client itself did: **blit the
   glyphs**. `src/sprites/ui/fonts.json` (`src/tools/cache-bake/ifont-bake-run.mjs`)
   carries all four of the cache's fonts - plain11, plain12, bold12, quill8 -
   as alpha atlases with the client's own per-glyph `ox/oy/adv`, the same data
   `src/fx.js` has always used for the damage numbers. Every glyph is drawn
   `drawImage(atlas, g.x, g.y, g.w, g.h, x + pen + g.ox, y + g.oy, g.w, g.h)` -
   integer source, integer destination, no scaling - so the result is the
   cache's mask, pixel for pixel, and the frame's own scale then blows that up
   exactly like the sprites beside it.

   **Blowing it up is where the second half of the problem lives** (2026-09-20).
   An interface square is a whole number of screen pixels only sometimes, and
   when it is not, nearest-neighbour has to round every 1px stroke to the nearer
   of 1 or 2 screen pixels - uneven weights inside one word, and a 12px mask has
   no weight to spare. So the layer canvases carry `image-rendering: pixelated`
   only while one square *is* a whole number of screen pixels (which is the case
   ratio-2 displays also reach at 1.5x), and are resampled smoothly when it is
   not; see the note in `paint`, which measures that product (`deviceScale`).
   The user's report: *"it feels like all the letters are being drawn with thin
   text weights ... we need the text to be drawn better at different viewport
   sizes"*. The other lever - showing the frame at a whole-number scale only - is
   the "Whole-number zoom" row in the additional-settings window.

   The DOM keeps the text - it is still what lays the words out, so wrapping,
   alignment and the boxes around them are untouched - but its own glyphs are
   made transparent, and every line box it produced is drawn for real onto one
   canvas per interface layer.

   One canvas per **layer** (`src/gameframe.js#LAYER_Z`: chrome, viewport, map,
   tabs, side, chat, overlay), not one per text element: seven bitmaps that are
   a few hundred kilobytes between them, each appended inside its own layer so
   the stacking order the interface already has is exactly preserved - the
   side panel's text can never paint over a modal, because the modal is a layer
   above it.

   The line boxes come from the browser itself: a `Range` over each text node,
   one character at a time, gives the rectangle the character was actually laid
   out in, and consecutive characters whose rectangles share a line are gathered
   back into the run to draw. That is what makes wrapping, `text-align` and
   mixed colours inside one line all work with no rules of our own.

   Two numbers make the drawing land where the browser put it:

     * the **baseline**. `Range` rectangles are the *font box* (ascent above the
       baseline, descent below), not the line box, so the baseline is
       `rect.top + K` where `K` belongs to the font: measured here, 8.8 for
       plain11, 11.2 for plain12/bold12, 14.4 for quill8 - and independent of the
       widget's line-height (checked at 11/12/16/18 for plain11). `K` is
       measured, not transcribed: `baselineOffset` builds a one-off probe of the
       font with a zero-height inline block on its baseline and reads the two
       rectangles back.
     * the **glyph's own top**, which the bake measures down from the top of the
       client's text line: the line top is `baseline - (fontHeight - 1)` (the
       same rule `webfont.mjs` puts the TTF's baseline at), and a glyph is then
       blitted at `lineTop + g.oy`.

   The pen is the client's own advance (`pen += g.adv`), not the browser's
   kerning, so a run's pixels are the same pixels the client drew.

   Everything is wrapped in try/catch and nothing is hidden until its own line
   has been drawn: an element this cannot handle (an underline - the decoration
   is drawn in the text colour and would vanish with it - a font that is not one
   of the cache's, a character the atlas has no glyph for, an empty box) simply
   keeps the browser's own rendering. */

import { Frame, FRAME_W } from "./gameframe.js";
import { fetchBakedJSON } from "./baked.js";
import { makeFont } from "./fx.js";

const HIDDEN = "sharpText";
const LAYER = "sharpLayer";

/* The layers, in the frame's own z order. Every text element in the interface
   is inside one of them (`src/gameframe.js#LAYER_Z`). */
const LAYER_NAMES = ["chrome", "map", "tabs", "side", "chat", "chatButtons", "overlay", "viewport"];

/* Which CSS family is which atlas. Longest name first: "rs-bold12" is not a
   prefix of "rs-plain12" but both end in "12", so a plain indexOf would still
   be unambiguous - this is just the explicit list. */
const FAMILIES = [
  ["rs-plain11", "plain11"],
  ["rs-plain12", "plain12"],
  ["rs-bold12", "bold12"],
  ["rs-quill8", "quill8"],
];

const canvasOf = new Map();     // layer element -> its canvas
const hidden = [];              // elements currently drawing no glyphs of their own
const offsets = new Map();      // "10px \"rs-plain11\", monospace" -> baseline offset
const tints = new Map();        // "plain11|#ff0000" -> the atlas tinted that colour
let fonts = null;               // {plain11, plain12, bold12, quill8} once loaded
let observer = null;
let queued = false;
let probe = null;
let started = false;
/* The frame's scale when the current pass's line boxes were read (see
   `runsUnder`): a `Range` rectangle is in screen pixels, but `baselineOffset`'s
   probe sits outside the scaled frame and so measures in interface pixels. */
let passScale = 1;
const clipCache = new Map();    // element -> its visible box (see clipBoxFor)

const familyOf = (css) => {
  for (const [name, key] of FAMILIES) if (css.indexOf(name) >= 0) return key;
  return null;
};

/* A colour that paints nothing: `transparent`, or any rgba() whose alpha is 0.
   An element the interface has hidden with `opacity` is skipped too - an
   invisible line should not be drawn (nor its glyphs "already transparent"
   rule trip). */
function invisible(colour) {
  if (!colour) return true;
  if (colour === "transparent") return true;
  const m = /^rgba?\(([^)]*)\)$/.exec(colour);
  if (!m) return false;
  const parts = m[1].split(",").map((v) => parseFloat(v));
  return parts.length > 3 && parts[3] === 0;
}

/* The frame's current scale: screen pixels per interface square. */
function frameScale() {
  const r = Frame.root && Frame.root.getBoundingClientRect();
  return r && r.width ? r.width / FRAME_W : 1;
}

/* What the *screen* gives one interface square: the frame's own scale times the
   display's ratio. That product is the number that decides how a 1px stroke in a
   glyph mask comes out, because it is the factor between the mask and the real
   pixels - see the note in `paint`. Not an integer about as often as not (a
   window at 1.14x on a 1.25-ratio display is 1.4265). */
function deviceScale() {
  return frameScale() * (window.devicePixelRatio || 1);
}

/* How far below a `Range` rectangle's top the baseline sits, for one font.
   Measured once per font, by laying the font out in a hidden probe with a
   zero-height inline block pushed down to its baseline. */
function baselineOffset(font) {
  const hit = offsets.get(font);
  if (hit != null) return hit;
  let k = 0;
  try {
    if (!probe) {
      probe = document.createElement("div");
      probe.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none";
      document.body.appendChild(probe);
    }
    const d = document.createElement("div");
    d.style.cssText = "white-space:nowrap;width:max-content";
    d.style.font = font;
    d.textContent = "Hxgjy";
    probe.appendChild(d);
    const range = document.createRange();
    range.selectNodeContents(d);
    const top = range.getBoundingClientRect().top;
    const mark = document.createElement("span");
    mark.style.cssText = "display:inline-block;width:1px;height:0;vertical-align:baseline";
    d.appendChild(mark);
    const base = mark.getBoundingClientRect().top;
    k = base - top;
    d.remove();
  } catch (e) { k = 0; }
  offsets.set(font, k);
  return k;
}

/* A text node's shadow, or null. Only the first shadow is honoured.
   Chrome serialises it colour-first (`rgb(0, 0, 0) 1px 1px 0px`) and Firefox
   offset-first (`1px 1px 0px rgb(0, 0, 0)`), so the numbers and the colour are
   picked out of the string rather than assumed to be in a particular order. */
function shadowOf(cs) {
  const s = cs.textShadow;
  if (!s || s === "none") return null;
  const first = s.split(/,(?![^(]*\))/)[0].trim();
  const nums = [...first.matchAll(/(-?\d*\.?\d+)px/g)].map((m) => parseFloat(m[1]));
  if (nums.length < 2) return null;
  const colour = first.replace(/(-?\d*\.?\d+)px/g, "").replace(/\s+/g, " ").trim();
  return { dx: nums[0], dy: nums[1], colour: colour || "rgb(0, 0, 0)" };
}

/* Every line of text under `el`, as runs, in document order. `el` itself is a
   text-bearing element (it has a direct text child); its descendants' text is
   part of the same run set, so mixed colours inside one line come out right. */
function runsUnder(el, layer) {
  const out = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue;
    if (!value || !value.trim()) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(parent);
    const fontKey = familyOf(cs.fontFamily);
    if (!fontKey) continue;
    if (invisible(cs.color) || cs.visibility === "hidden" || cs.opacity === "0") continue;
    /* A decoration is painted in the text colour, so hiding the glyphs would
       take the underline with it; such an element keeps the browser's own. */
    if (cs.textDecorationLine && cs.textDecorationLine !== "none") continue;
    const font = cs.fontSize + " " + cs.fontFamily;
    /* The probe reads the baseline in interface pixels; this pass's rectangles
       are in screen pixels, so the offset is scaled up to join them. Without
       this every glyph sat K*(scale-1) too high - invisible at the editor's
       ~1.07x, a full 6px above the orb plates at fullscreen's ~2.15x. */
    const k = baselineOffset(font) * passScale;
    const shadow = shadowOf(cs);
    const atlas = fonts && fonts[fontKey];
    let line = null;
    for (let i = 0; i < value.length; i++) {
      const r = rectAt(range, node, i);
      if (!r) {
        if (line) line.text += value[i];
        continue;
      }
      if (!line || Math.abs(r.top - line.top) > 0.6 || r.left > line.right + 1.5) {
        line = {
          text: value[i], top: r.top, left: r.left, right: r.right,
          bottom: r.bottom,
          colour: cs.color, shadow, font, fontKey,
          size: parseFloat(cs.fontSize) || 0,
          baseline: r.top + k, el: parent,
          /* The box this line is actually *visible* in - see clipBoxFor. A
             `Range` rectangle is a layout rectangle: an element clipped away by
             an ancestor's `overflow: hidden` still reports the position it
             would have had, which is exactly how a scrolled-out list row's text
             used to be drawn on top of whatever sits below the window. */
          clip: clipBoxFor(parent, layer),
          ok: atlas ? (value[i] === "\n" || atlas.has(value[i])) : false,
        };
        out.push(line);
      } else {
        line.text += value[i];
        if (!line.ok || (value[i] !== "\n" && atlas && !atlas.has(value[i]))) line.ok = false;
        if (r.right > line.right) line.right = r.right;
        if (r.bottom > line.bottom) line.bottom = r.bottom;
      }
    }
  }
  return out;
}

/* The rectangle a text element is really visible in, or null when nothing
   clips it.

   The interface scrolls by moving a container's content - the bank's and the
   shop's item list (`ui.js#renderBank` / #renderShop), the chat log, a
   ledger's page - and every one of those containers hides its overflow. The
   browser honours that for the DOM, but the glyphs here are not DOM pixels any
   more: this module reads each character's *layout* rectangle out of a `Range`
   and blits the mask onto a layer canvas. A layout rectangle does not know it
   has been clipped, so a row scrolled out of a shop list was still drawn - at
   the offset position it would have occupied - on top of the window's frame and
   past it (the user's report: *"the item quantity in the shop is overlaying
   past its border onto the chatbox"*). Intersecting every clipping ancestor's
   rectangle and clipping the canvas to that puts the glyphs back inside the box
   that hides them, exactly as the browser does for everything else.

   Cached per element - a line's box does not depend on its text, and one
   refresh draws every line in the interface. The cache is dropped at the top
   of each pass, because a scroll or a relayout moves the boxes. */
function clipBoxFor(el, layer) {
  const hit = clipCache.get(el);
  if (hit !== undefined) return hit;
  let box = null;
  for (let n = el; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
      const r = n.getBoundingClientRect();
      box = box
        ? {
          top: Math.max(box.top, r.top), left: Math.max(box.left, r.left),
          right: Math.min(box.right, r.right), bottom: Math.min(box.bottom, r.bottom),
        }
        : { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
    }
    if (n === layer) break;
  }
  clipCache.set(el, box);
  return box;
}

function rectAt(range, node, i) {
  range.setStart(node, i);
  range.setEnd(node, i + 1);
  const r = range.getBoundingClientRect();
  if (!r || (r.width === 0 && r.height === 0)) return null;
  return r;
}

/* Whether any of `el`'s ink sits under the stats tab's open hover box (see the
   note in `collect`). Measured on screen rectangles, so scrolling and the
   frame's scale are already accounted for. */
function occludedByTip(el, layer) {
  let tip = null;
  try {
    if (layer.querySelector) tip = layer.querySelector(".skillTipBox");
  } catch (e) { return false; }
  if (!tip || tip.hidden) return false;
  const t = tip.getBoundingClientRect();
  if (!t.width || !t.height) return false;
  let r = null;
  try { r = el.getBoundingClientRect(); } catch (e) { return false; }
  if (!r.width || !r.height) return false;
  return r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top;
}

/* Is `el` a text-bearing element: does it have a text child of its own? The
   walk stops at the first one it finds, so a line of mixed inline elements is
   drawn once, by its outermost element. */
function ownsText(el) {
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) return true;
  }
  return false;
}

function collect(el, into) {
  if (el.nodeType !== 1) return;
  /* Split private chat's strip is laid out *outside* its layer's box (above
     the chatbox, over the game view), so a layer-sized canvas can never hold
     its glyphs - and hiding the DOM originals left the strip blank. It keeps
     the browser's own rendering instead (src/gameframe.js#setChatSplit). */
  if (el.classList && el.classList.contains("chatprivabove")) return;
  if (ownsText(el)) {
    /* The canvas this line's glyphs go on - its "text host". Nearly always the
       surrounding `.layer`, but the **context menu is a host of its own**.

       The menu box is one of the very few things in the interface that must
       paint *over* its layer's own glyph canvas: it carries a z-index of 40 so
       that it covers a bank or shop row's quantities, which are drawn on the
       overlay layer's canvas at 38 (style.css#.sharpLayer). Its own rows would
       be drawn on that same canvas, and so covered by its own brown box - the
       menu then renders as a blank rectangle (\"the right click is loading but
       it's blank\", 2026-09-22). One canvas per layer cannot be both above the
       full interfaces and below the menu, so the menu gets a canvas of its own,
       appended inside it: glyphs painted there are above its background and its
       rows whatever the layer's z-index is, and the overlay canvas keeps the
       place (38, under the menu, over #fullIface) that keeps the shop's numbers
       from showing through the menu.

       `paint` handles any host: the canvas fills its box and every glyph is
       positioned from the canvas' own screen rectangle, so "relative to the
       menu" and "relative to the layer" are the same arithmetic. */
    const layer = el.closest(".ctxmenu") || el.closest(".layer");
    /* Text that is not inside a layer would have to be drawn on the frame
       itself, above every layer including the modals - so it keeps the
       browser's own rendering instead. Nothing in the interface is like that. */
    if (!layer || layer === Frame.root) return;
    /* The stats tab's hover box (ui.js#showSkillTipBox) is opaque and paints
       above the level numbers - but this pass draws every glyph onto one
       canvas *above* that box, so a covered number's mask would show straight
       through the yellow. A line the open box covers is left to the browser,
       whose glyphs sit under the box in paint order and are hidden by it. The
       box's own lines are always drawn - they belong above their background. */
    if (!el.closest(".skillTipBox") && occludedByTip(el, layer)) return;
    let list = into.get(layer);
    if (!list) { list = []; into.set(layer, list); }
    for (const run of runsUnder(el, layer)) list.push(run);
    return;
  }
  for (let c = el.firstChild; c; c = c.nextSibling) collect(c, into);
}

function clearHidden() {
  while (hidden.length) {
    const el = hidden.pop();
    el.classList.remove(HIDDEN);
  }
}

function dropCanvas(layer) {
  const cv = canvasOf.get(layer);
  if (cv) { cv.remove(); canvasOf.delete(layer); }
}

/* The whole atlas painted one flat colour, so a glyph can be blitted straight
   in the colour it should be without a per-string pass. A dozen or so of these
   exist at once (four fonts x the handful of interface colours). */
function tintedPlate(fontKey, colour) {
  const key = fontKey + "|" + colour;
  let cv = tints.get(key);
  if (cv) return cv;
  const f = fonts[fontKey];
  cv = document.createElement("canvas");
  cv.width = f.atlas.width;
  cv.height = f.atlas.height;
  const c = cv.getContext("2d");
  c.drawImage(f.atlas, 0, 0);
  c.globalCompositeOperation = "source-in";
  c.fillStyle = colour;
  c.fillRect(0, 0, cv.width, cv.height);
  if (tints.size > 64) tints.clear();
  tints.set(key, cv);
  return cv;
}

/* One run of text, blitted glyph by glyph with the client's own pen. */
function blit(ctx, run, x, y, colour, fs) {
  const f = fonts[run.fontKey];
  const plate = tintedPlate(run.fontKey, colour);
  const s = fs || 1;
  let pen = 0;
  for (const ch of run.text) {
    const g = f.glyph(ch);
    if (g && g.w > 0) ctx.drawImage(plate, g.x, g.y, g.w, g.h, Math.round(x + pen + g.ox * s), Math.round(y + g.oy * s), Math.max(1, Math.round(g.w * s)), Math.max(1, Math.round(g.h * s)));
    pen += g ? g.adv * s : 0;
  }
}

const NATIVE_SIZE = { plain11: 10, plain12: 12, bold12: 12, quill8: 15 };

/* Paint one layer's runs onto its canvas. Returns the elements whose glyphs were
   all drawn (and so may be hidden), or null if the layer could not be drawn. */
function paint(layer, runs) {
  const box = layer.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const scale = frameScale() || 1;
  const w = Math.ceil(layer.clientWidth);
  const h = Math.ceil(layer.clientHeight);
  if (!w || !h) return null;
  let cv = canvasOf.get(layer);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.className = LAYER;
    cv.style.left = "0px";
    cv.style.top = "0px";
    canvasOf.set(layer, cv);
  }
  cv.style.width = w + "px";
  cv.style.height = h + "px";
  /* How the mask reaches the screen is decided here, and it depends on whether
     one interface square is a whole number of *screen* pixels:

       * whole (1.0, 2.0, 2.5 on a ratio-2 display, ...): the mask can go through
         untouched, so `pixelated` is used and every stroke stays a square block
         of screen pixels - the whole point of this module;
       * fractional (1.4265, say): nearest-neighbour cannot put a 1px stroke on
         the grid, so it rounds each one to 1 or 2 screen pixels according to
         where it happens to fall, and a 12px mask has no weight to spare - that
         is the user's *"it feels like all the letters are being drawn with thin
         text weights ... we need the text to be drawn better at different
         viewport sizes"* (2026-09-20). Resampling smoothly instead spreads the
         same ink over the device pixel the stroke actually covers, which keeps
         the weight even at the cost of a faint softness on the edges. The
         alternative - only ever showing the frame at a whole-number scale - is
         still there as the "Whole-number zoom" row (src/renderopts.js), and it
         is the way to get the mask through cleanly at *every* size.

     The check is on the product, not on the frame's scale alone: a ratio-2
     display is pixel-exact at 1.5x, and a ratio-1.25 display is not pixel-exact
     at any whole number. */
  const k = deviceScale();
  const wholeK = Math.round(k);
  const exact = wholeK >= 1 && Math.abs(k - wholeK) < 0.02;
  cv.style.imageRendering = exact ? "pixelated" : "auto";
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  /* keep it the layer's topmost child */
  if (layer.lastChild !== cv) layer.appendChild(cv);
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  /* The canvas' own screen rectangle is the origin - whatever the layer's
     containing block turns out to be, this is where its square (0,0) is. */
  const cb = cv.getBoundingClientRect();
  const ox = cb.left, oy = cb.top;
  const drawn = new Set();
  const blocked = new Set();
  const canvasClip = (clip) => {
    ctx.beginPath();
    ctx.rect(
      Math.floor((clip.left - ox) / scale), Math.floor((clip.top - oy) / scale),
      Math.ceil((clip.right - ox) / scale) - Math.floor((clip.left - ox) / scale),
      Math.ceil((clip.bottom - oy) / scale) - Math.floor((clip.top - oy) / scale),
    );
    ctx.clip();
  };
  ctx.imageSmoothingEnabled = false;
  for (const run of runs) {
    if (!run.ok) { blocked.add(run.el); continue; }
    const native = NATIVE_SIZE[run.fontKey] || 0;
    const fs = (run.size && native) ? run.size / native : 1;
    let x = Math.round((run.left - ox) / scale);
    let y = Math.round((run.baseline - oy) / scale) - (fonts[run.fontKey].fontHeight - 1) * fs;
    /* Scaled text (a CSS size above the atlas' own) would otherwise start at the
       layout box's left edge and grow a different width than the browser's own
       line - so its ink sits off-centre in anything centred (buttons, titles).
       Centre the drawn ink on the layout box instead. Unscaled text is left
       exactly as it was. */
    if (Math.abs(fs - 1) > 0.001) {
      const f = fonts[run.fontKey];
      let drawnW = 0, minOy = Infinity, maxBot = -Infinity;
      for (const ch of run.text) {
        const g = f.glyph(ch);
        drawnW += (g ? g.adv : 0) * fs;
        if (g && g.w > 0) {
          if (g.oy < minOy) minOy = g.oy;
          if (g.oy + g.h > maxBot) maxBot = g.oy + g.h;
        }
      }
      if (!isFinite(minOy)) { minOy = 0; maxBot = 0; }
      const runW = (run.right - run.left) / scale;
      x = Math.round((run.left - ox) / scale + (runW - drawnW) / 2);
      const lineMid = (run.top - oy) / scale + ((run.bottom - run.top) / scale) / 2;
      y = lineMid - ((minOy + maxBot) / 2) * fs;
    }
    /* A line wholly inside its visible box needs no clip at all; one that
       crosses the edge of a scrolling container is clipped to it (see
       clipBoxFor). */
    const c = run.clip;
    const clipped = c && (run.left < c.left - 0.5 || run.right > c.right + 0.5
      || run.top < c.top - 0.5 || run.bottom > c.bottom + 0.5);
    if (clipped) { ctx.save(); canvasClip(c); }
    if (run.shadow) blit(ctx, run, x + Math.round(run.shadow.dx), y + Math.round(run.shadow.dy), run.shadow.colour, fs);
    blit(ctx, run, x, y, run.colour, fs);
    if (clipped) ctx.restore();
    drawn.add(run.el);
  }
  const hide = [];
  for (const el of drawn) if (!blocked.has(el)) hide.push(el);
  return hide;
}

function refresh() {
  queued = false;
  if (!started || !Frame.root || !fonts) return;
  try {
    passScale = frameScale() || 1;
    const into = new Map();
    /* Take the class off *before* reading any style: `runsUnder` reads the
       colour it is about to draw with, and a hidden element's colour is
       `rgba(0, 0, 0, 0)` - so collecting first drew every line in invisible
       ink, which is a canvas that clears and refills with nothing. */
    clearHidden();
    clipCache.clear();
    collect(Frame.root, into);
    /* a layer the interface has hidden keeps no text at all - drop its canvas
       rather than leave the last thing it drew frozen in the DOM */
    for (const [layer, runs] of into) if (!runs.length) { dropCanvas(layer); into.delete(layer); }
    for (const [layer] of canvasOf) if (!into.has(layer)) dropCanvas(layer);
    for (const [layer, runs] of into) {
      const done = paint(layer, runs);
      if (!done) continue;
      for (const el of done) {
        el.classList.add(HIDDEN);
        hidden.push(el);
      }
    }
  } catch (e) {
    /* never let a text pass take the interface down */
    try { clearHidden(); } catch (e2) { /* ignore */ }
  }
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(refresh);
}

/* Our own DOM edits (the canvases, and the class that hides the glyphs) are
   not inputs; ignoring them keeps the observer from re-triggering itself. */
function ours(record) {
  const mine = (n) => n.nodeType === 1 && (n.classList.contains(LAYER) || n.classList.contains(HIDDEN));
  if (record.type === "childList") {
    const added = [...record.addedNodes];
    const removed = [...record.removedNodes];
    if ((added.length || removed.length) && added.every(mine) && removed.every(mine)) return true;
    if (record.target.nodeType === 1 && record.target.classList.contains(LAYER) && added.length && added.every(mine)) return true;
  }
  return false;
}

export function refreshSharpText() { schedule(); }

/* Stop drawing and hand the text back to the browser. For tooling that has to
   serialise the interface (a full-page screenshot, for instance, which cannot
   read a canvas) - not something the game itself ever calls. */
export function stopSharpText() {
  started = false;
  if (observer) { observer.disconnect(); observer = null; }
  for (const [, cv] of canvasOf) cv.remove();
  canvasOf.clear();
  clearHidden();
}

export function startSharpText() {
  if (started || !Frame.root) return;
  started = true;
  /* The atlases are the cache's own glyph masks; until they arrive nothing is
     drawn and every element keeps the browser's own text. */
  fetchBakedJSON("src/sprites/ui/fonts.json")
    .then((data) => {
      const built = {};
      for (const key of Object.keys(data.fonts || {})) built[key] = makeFont(data.fonts[key]);
      fonts = built;
      schedule();
    })
    .catch((e) => console.warn("sharp: could not load the interface font atlases", e));
  observer = new MutationObserver((records) => {
    for (const r of records) if (!ours(r)) { schedule(); return; }
  });
  observer.observe(Frame.root, { childList: true, subtree: true, characterData: true });
  /* A line scrolled inside the chat log or a ledger moves the text but changes
     no node, so the observer never hears about it. */
  Frame.root.addEventListener("scroll", () => schedule(), true);
  /* The frame's scale decides the device-to-interface ratio `paint` picks its
     filter from, and a resize changes it without touching a single node - nor
     does the "Whole-number zoom" row, which changes it from the options window.
     `Frame.onResize` is the frame's own announcement of that (and fires once
     straight away), with the window's events behind it for a display-ratio change
     that happens to leave the size alone. */
  Frame.onResize(() => schedule());
  window.addEventListener("resize", () => schedule(), { passive: true });
  window.addEventListener("orientationchange", () => schedule(), { passive: true });
  /* Style-driven colour changes are not mutations, so the observer above is
     blind to them: a context-menu row's `:hover { color: #ffff00 }` never
     reaches this pass, and since the row's own glyphs are transparent the
     highlight simply would not appear. `pointerover`/`pointerout` fire on
     element boundaries (not per pixel), which is exactly when a hover rule can
     have changed, and focus moves can change text colour the same way. */
  for (const ev of ["pointerover", "pointerout", "pointerdown", "focusin", "focusout"]) {
    Frame.root.addEventListener(ev, () => schedule(), true);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => schedule());
}
