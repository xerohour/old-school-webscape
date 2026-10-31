/* Screen-space UI effects drawn over the 3D view — currently the damage
   hitsplats.

   The real client renders hitsplats in its 2D pass, after the world, straight
   onto the same surface at a fixed pixel size (they do not scale with
   distance). We mirror that with a transparent overlay canvas stacked on the
   game canvas, projecting each target's model centre to screen space.

   The sprite and the numerals are not redrawn by hand: they are the client's
   own assets, baked out of the cache into src/sprites/ui/ (see
   src/tools/cache-bake/ui.mjs). The behaviour copied from the client
   (317 `drawHitsplats`):

     * anchor = the target's screen position at half its model height
     * splat centred on the anchor: drawn at (anchor - 12, anchor - 12)
     * the damage number is drawn twice — black at (anchor, anchor + 4) then
       white at (anchor - 1, anchor + 3) — i.e. white text with a one pixel
       black drop shadow, in the plain-11 font
     * up to four simultaneous splats per target: the second pushed 20px up, the
       third and fourth 15px left/right and 10px up
     * a splat lives 70 client cycles (70 x 20ms = 1.4s) and then vanishes —
       no rise, no fade
*/

import * as THREE from "https://esm.sh/three@0.160.0";
import { fetchBakedJSON } from "./baked.js";
import { RenderOptions } from "./renderopts.js";

const TICK_MS = 20;
const DISPLAY_CYCLES = 70;
export const SPLAT_LIFE_MS = TICK_MS * DISPLAY_CYCLES;

const SLOT_OFFSETS = [
  [0, 0],
  [0, -20],
  [-15, -10],
  [15, -10],
];

const WHITE = "#ffffff";
const BLACK = "#000000";

/* The click cross. The client keeps eight of them (media archive "cross" 0..7,
   baked here from their index-8 twins): four YELLOW frames for a click that
   only moves you and four RED ones for a click that resolves to an action -
   attacking something, or picking an item up. `set` is which of the two sets a
   mark belongs to, shared with the minimap (see src/ui.js).

   The timing is the client's own, exactly: `crossIndex += 20` once per 20ms
   cycle and `crossIndex / 100` picks the frame, so each of the four frames is
   shown for 100ms and the mark is gone at 400 (`if (crossIndex >= 400)
   crossType = 0`). There is no fade - the frames themselves are the animation
   (a small x, a big x, then the two frames where it shatters). */
export const MARK_WALK = "walk";
export const MARK_ACTION = "action";
export const MARK_FRAME_MS = 100;
export const MARK_LIFE_MS = MARK_FRAME_MS * 4;
/* the client draws a cross cell at (cursor - 8 - 4, cursor - 8 - 4) */
const MARK_ORIGIN = 12;

/* The hitsplat is drawn at ONE fixed size, exactly like the client: the sprite
   is the cache's own 24x23 frame blitted at 1:1 into the fixed-size viewport,
   so a splat on a distant cow is the same size as one on the player. It never
   scales with distance or with the character it sits on. */
const SPLAT_SCALE = 1;

/* The overhead health bar: the client's own red bar - the health that has been
   lost - with a green bar over it for the health that is left, and a one pixel
   black border so it stays legible over grass, sand and water alike. The
   client's own rule is one duration for the player and every creature alike:
   each damage mask sets `loopCycleStatus = tick + 300` and the bar draws while
   `loopCycleStatus > tick` (rev-317 `Client`, both NPC hit masks and both
   player hit masks), and the client loop runs at 50 Hz - so 300 cycles is 6 s,
   i.e. 10 server ticks, refreshed by every new hit. BAR_LIFE_MS is that 6 s
   (see `hitsplat`, which stamps it, and `showBar`, which restamps it for hits
   landed under somebody else's blows). A creature ALSO carries BAR_TICKS
   after one of the player's blows lands on it - but that countdown is not
   the bar, it is the fuse on its retaliation delay (src/combat.js): the bar
   going out and the retaliation starting are no longer the same moment, which
   is what lets the bar follow the client's own 6 s while the creature still
   answers blows on its old fuse.

   The size is the client's own, in *pixels*, straight out of rev-500
   `Client.entityOverlays`:

       Pix2D.fillRect(projectX - 15, projectY - 3, healthLeft, 5, 0x00ff00);
       Pix2D.fillRect(projectX - 15 + healthLeft, projectY - 3, 30 - healthLeft, 5, 0xff0000);

   - a thirty pixel bar, five tall, centred on the head-top anchor. Nothing
   about it scales with the camera: every overhead mark the client draws is
   measured in pixels off one projected anchor, so only the anchor moves with
   the world. The border is this world's own addition (the client's bar has
   none) and exists so the bar does not vanish into dark ground.

   The bar is a fixed mark over the creature: it hangs over the crown and never
   moves - no lift, no drift, no settling - so the health you glanced at is
   always exactly where you left it, even mid-cast. */
const BAR_W = 30;
const BAR_H = 5;
const BAR_DX = -15;
const BAR_DY = -3;
/* the lowest a bar is ever drawn: a bar pinned to a rat's crown sits on the
   rat, so a creature shorter than this carries its bar a little above itself */
const BAR_FLOOR_TILES = 1.3;
const BAR_LIFE_MS = 6000;
export const BAR_TICKS = 2;
const BAR_BG = "#c00000";
const BAR_FILL = "#00d000";
const BAR_BORDER = "#000000";
/* The hovered-but-no-longer-fresh bar: the same box at half alpha with a grey
   border, so the fresh-to-ghost step reads as the bar going quiet rather than
   vanishing from under a cursor that never moved. */
const BAR_GHOST_ALPHA = 0.5;
const BAR_GHOST_BORDER = "#808080";
/* How far out the overhead health bars and hitsplats draw, in tiles from what
   the camera is looking at: past this nothing shows a bar or a number,
   however hard the fight. Both are fixed-size screen marks, so at long range
   they read clearly over bodies that have shrunk to specks - the fight three
   screens away shouts as loud as the one on your own tile. Inside the models'
   own LOD range (38 tiles), so a near creature never loses its bar while its
   body still draws. Names, chat and prayer icons are untouched: those are
   how you find people, not how loud a far fight is. */
const OVERHEAD_RANGE = 32;
const OVERHEAD_RANGE2 = OVERHEAD_RANGE * OVERHEAD_RANGE;

/* The overhead prayer icon: while an overhead prayer is up, the client blits
   that prayer's own head icon over the head - the 25x25 sprites of the cache's
   `headicons_prayer` archive (src/tools/cache-bake/frame.mjs#GROUPS, baked as
   `headicon0`..`headicon6`), NOT the 30x30 sprite the prayer book's cell
   carries. Same place, same anchor as the health bar and the name, and the same
   fixed pixel offsets the client uses:

       headiconsPrayer[icon].plotSprite(projectX - 12, projectY - 30)

   - `Client.entityOverlays`. Nothing here scales with the camera either: the
   sprite is blitted 1:1 at twenty-five pixels square at every distance and
   every zoom, which is exactly why the client can measure it in pixels at all.
   The -12 leaves the sprite's left edge twelve pixels left of the anchor (it is
   twenty-five wide, so it is within a pixel of centred) and the -30 leaves its
   bottom edge five pixels above the anchor - which is the two pixel gap above
   the health bar's own top at -3. A PK skull, when one is up, stacks a further
   twenty-five pixels above (the client walks -30, then -55); this world has no
   skull icons, and the only creature that can carry an overhead prayer here is
   the player. */
const OVERHEAD_SIZE = 25;
const OVERHEAD_DX = -12;
const OVERHEAD_DY = -30;
/* the gap between the top of the icon and the name above it, in pixels (the
   label is a fixed twelve pixel face, so its gap is fixed too) */
const OVERHEAD_LABEL_GAP = 2;

/* The one point every overhead mark hangs off. The client computes it as
   `getOverlayPos(..., entity.getHeight() + 15, entity)` - the entity's own
   height above its feet, plus a flat fifteen units, where a tile is 128 units,
   so about a tenth of a tile - and then places the mark at a fixed pixel offset
   from it. `height` is the model's authored height (src/models3d.js#buildMesh),
   the same measure the client's per-entity height is, and `floor` is the
   lowest crown a mark may hang from (a rat is shorter than its own bar). */
const OVERLAY_HEAD_UNITS = 15 / 128;

/* Overhead labels - names and spoken lines (src/fx.js#renderLabels). The face is
   the cache's own bold 12, drawn from the baked glyph mask in
   src/sprites/ui/fonts.json exactly like the rest of the interface (one canvas
   pixel per glyph pixel - see Fx#labelText), because a glyph the browser
   rasterised arrives anti-aliased and the frame's own upscale then smears it
   into a soft, ghosted line. NAME_FONT is only the fallback for a character the
   mask does not carry, and the cache's 95 glyphs are plain ASCII. */
const NAME_FONT = "12px rs-bold12, monospace";
const NAME_COLOR = "#ffffff";
/* ...and the colour a name goes when its owner has switched away from their tab
   (src/net.js#STATE_AWAY, src/game.js#updateGhostState). A backgrounded player
   cannot send anything, so the body they leave behind is a figure standing
   perfectly still - and a motionless player and a player who is not at the
   keyboard look exactly the same over somebody else's head. The grey is the
   client's own way of saying which one this is, and it is deliberately the same
   grey as everything else this interface greys out: the *body* stays exactly as
   it is, because an away player is still standing right there, and only the
   label changes, because only the label is telling you something about a person
   rather than about a body. */
const AFK_NAME_COLOR = "#808080";
const NAME_SHADOW = "#000000";
/* the label keeps the health bar's own floor, so a label and a bar on the same
   head stack rather than overlapping */
const NAME_FLOOR_TILES = 1.3;
/* The gap between the crown and the label, in *pixels* - not in tiles. The label
   is drawn at a fixed pixel size (12px), so measuring its gap in world units made
   the text float further off the head the further the camera zoomed out. A text
   block is a fixed number of pixels tall, and so is the gap above it.

   Ten pixels is measured, not guessed. The 12px face carries its descenders four
   or five below the baseline, so a line with a "g" in it comes down four or five
   pixels lower than one without; ten puts the crown three pixels under the worst
   case (a descender) and seven under the best, which is the snug, attached look
   the client has. Eight was measured too, and left the worst case clearing the
   head by a single pixel. */
const NAME_GAP_PX = 10;

/* Overhead chat (src/fx.js#renderLabels): the line someone has just spoken,
   drawn in the client's own yellow for public chat and stacked *above* the name
   so the newest line is always the one nearest the head. A line longer than the
   viewport can show is wrapped to a character budget and capped - a 200-char
   message drawn in one go would run off both sides of a 512-pixel view. */
const CHAT_COLOR = "#ffff00";
const CHAT_LINE = 13;         /* one line of the 12px face, plus a pixel of air */
const CHAT_LINE_CHARS = 46;   /* ~46 characters fit across the viewport */
const CHAT_MAX_LINES = 3;

/* Pack a spoken line to the width the overlay can show. A single "word" longer
   than the budget (a pasted URL) is hard-split rather than allowed to overflow,
   and past the last line the rest is dropped - better a truncated line over
   somebody's head than a paragraph. */
function wrapChat(text, perLine, maxLines) {
  const lines = [];
  let line = "";
  for (const raw of String(text).split(" ")) {
    let word = raw;
    while (word.length > perLine) {
      if (line) { lines.push(line); line = ""; }
      lines.push(word.slice(0, perLine));
      word = word.slice(perLine);
      if (lines.length >= maxLines) return lines;
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= perLine) line += " " + word;
    else { lines.push(line); line = word; }
    if (lines.length >= maxLines) return lines;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

/* The drop shadow both long labels wear is the client's own single black pixel;
   Fx#labelText blits that copy and the coloured one over it. */

export const Fx = {
  canvas: null,
  ctx: null,
  camera: null,
  ready: false,
  splats: [],
  /* the click cross: {x, y, z, set, born} - a world anchor re-projected every
     frame, drawn at a fixed pixel size on the overlay canvas */
  marks: [],
  guide: null,
  /* the creature whose bar is shown even before any hit has landed on it: the
     player's current combat target (see src/combat.js#Combat.target) and
     whatever the cursor is over (see updateWorldHover in src/ui.js) */
  focus: null,
  hover: null,
  frames: null,
  crosses: null,
  font: null,
  /* the bold 12 the overhead labels are blitted from (see labelText) */
  labelFont: null,
  _textCache: new Map(),
  _dpr: 1,
  _vw: 0,
  _vh: 0,
  _v: null,
  _v2: null,
  /* Both are installed by src/ui.js, which is the only place that knows what a
     prayer is and where the interface sprites live. Until they are set, the
     overhead painter does nothing at all - so this file keeps no dependency on
     either (see renderOverheads).

       overheadPart(entity) -> sprite part name to fly over the head, or null
       drawPart(ctx, name, x, y, w, h) -> blit that sprite                    */
  overheadPart: null,
  drawPart: null,

  init({ canvas, camera } = {}) {
    this.canvas = canvas || document.getElementById("fxLayer");
    this.ctx = this.canvas.getContext("2d");
    this.camera = camera || null;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this.xLayer = document.createElement("div");
    this.xLayer.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:10000;overflow:hidden;";
    document.body.appendChild(this.xLayer);
    this.xTimers = [];
    this.resize();
    window.addEventListener("resize", () => this.resize());
    return this.load();
  },

  async load(base = "src/sprites/ui/") {
    try {
      const [hs, fonts, cross] = await Promise.all([
        fetchBakedJSON(base + "hitsplats.json"),
        /* the same load src/sharp.js needs; `fetchBakedJSON` is what keeps the
           two of them from being two requests (see src/baked.js) */
        fetchBakedJSON(base + "fonts.json"),
        fetchBakedJSON(base + "crosses.json").catch(() => null),
      ]);
      this.frames = {};
      for (const f of hs.frames) this.frames[f.kind] = makeFrame(f);
      this.origin = hs.origin;
      this.font = makeFont(fonts.fonts.plain11);
      /* The overhead labels' own face, out of the same bake. A bake without it
         leaves the labels on the browser's text rather than taking the overlay
         down with it. */
      this.labelFont = fonts.fonts.bold12 ? makeFont(fonts.fonts.bold12) : this.font;
      /* the eight cross frames, split into the client's two sets: frames 0-3 are
         the yellow (walk) cross and 4-7 the red (action) one */
      this.crosses = { walk: [], action: [] };
      if (cross) {
        for (const f of cross.frames || []) {
          if (!f) continue;
          const set = f.spriteId >= 519 ? "action" : "walk";
          this.crosses[set].push(makeFrame(f));
        }
      }
      this.ready = true;
    } catch (e) {
      console.warn("fx: could not load hitsplat assets", e);
    }
    return this;
  },

  resize() {
    if (!this.canvas) return;
    /* the viewport is the client's own 512x334 and gets upscaled by the frame,
       so the overlay is drawn at exactly one canvas pixel per game pixel */
    const w = this.canvas.clientWidth || 512;
    const h = this.canvas.clientHeight || 334;
    const dpr = 1;
    if (w === this._vw && h === this._vh && dpr === this._dpr) return;
    this._vw = w;
    this._vh = h;
    this._dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
  },

  /* Spawn a hitsplat for `entity`. `kind` is one of the baked frame names
     (miss, damage, poison, disease, max); a zero amount defaults to `miss`. */
  hitsplat(entity, amount, kind) {
    if (!entity || !this.ready) return null;
    const k = kind || (amount > 0 ? "damage" : "miss");
    const now = performance.now();
    const slots = entity._fxSlots || (entity._fxSlots = [0, 0, 0, 0]);
    let slot = 3;
    for (let i = 0; i < 4; i++) {
      if (slots[i] <= now) { slot = i; break; }
    }
    slots[slot] = now + SPLAT_LIFE_MS;
    /* a hit also raises the creature's overhead health bar for a few seconds,
       so the bar is showing on exactly the thing the blows are landing on */
    entity.hpBarUntil = now + BAR_LIFE_MS;
    const splat = { e: entity, amount: amount | 0, kind: this.frames[k] ? k : "damage", slot, born: now };
    this.splats.push(splat);
    if (this.splats.length > 64) this.splats.shift();
    return splat;
  },

  update() {
    const now = performance.now();
    for (let i = this.splats.length - 1; i >= 0; i--) {
      if (now - this.splats[i].born >= SPLAT_LIFE_MS) this.splats.splice(i, 1);
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      if (now - this.marks[i].born >= MARK_LIFE_MS) this.marks.splice(i, 1);
    }
  },

  /* Show the click cross at a world point. One at a time, as in the client -
     each click replaces the last. `set` is MARK_WALK or MARK_ACTION. */
  setMarker(x, y, z, set) {
    this.marks.length = 0;
    this.marks.push({ x, y, z, set: set === MARK_ACTION ? MARK_ACTION : MARK_WALK, born: performance.now() });
  },

  setGuide(x, y, z) {
    this.guide = { x, y, z };
  },

  clearGuide() {
    this.guide = null;
  },

  renderGuide(ctx, cam) {
    const gd = this.guide;
    if (!gd) return;
    const v = this._v || (this._v = new THREE.Vector3());
    const bob = Math.sin(performance.now() / 280) * 0.5;
    v.set(gd.x, gd.y + 2.5 + bob, gd.z).project(cam);
    if (v.z > 1) return;
    const cx = (v.x * 0.5 + 0.5) * this._vw;
    const cy = (-v.y * 0.5 + 0.5) * this._vh;
    if (cx < -32 || cy < -32 || cx > this._vw + 32 || cy > this._vh + 32) return;
    ctx.fillStyle = "#ffe14d";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy - 7);
    ctx.lineTo(cx + 9, cy - 7);
    ctx.lineTo(cx, cy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  },

  /* Show the click cross at the CURSOR, which is where the client draws it: its
     cross is blitted in the 2D pass at (clickX - 8 - 4, clickY - 8 - 4), so it
     sits wherever the mouse was - over a wall, over a creature's shoulder, over
     the grass. It is NOT placed on the tile a click resolved to, nor projected
     from a world point (a wall has no ground behind it to stand the cross on,
     and a model's click box is wider than its tile). The client's clickX/clickY
     are in its own 512x334 view space, so the page coordinates are mapped into
     this canvas's space here. `set` is MARK_WALK or MARK_ACTION. */
  setMarkerScreen(clientX, clientY, set) {
    this.spawnX(clientX, clientY, set);
  },

  spawnX(clientX, clientY, set) {
    for (const t of this.xTimers) clearTimeout(t);
    this.xTimers.length = 0;
    this.xLayer.innerHTML = "";
    const list = this.crosses && this.crosses[set === MARK_ACTION ? "action" : "walk"];
    if (!list || !list.length) return;
    const r = this.canvas ? this.canvas.getBoundingClientRect() : null;
    if (!r || !r.width) return;
    this.xLayer.style.clipPath = "inset(" + r.top + "px " + (window.innerWidth - r.right) + "px " + (window.innerHeight - r.bottom) + "px " + r.left + "px)";
    const s = r.width / 512;
    let mw = 0, mh = 0;
    for (const f of list) { mw = Math.max(mw, f.width); mh = Math.max(mh, f.height); }
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(mw * s));
    cv.height = Math.max(1, Math.round(mh * s));
    cv.style.cssText = "position:absolute;left:" + (clientX - cv.width / 2) + "px;top:" + (clientY - cv.height / 2) + "px;image-rendering:pixelated;";
    this.xLayer.appendChild(cv);
    const c = cv.getContext("2d");
    for (let i = 0; i < list.length; i++) {
      this.xTimers.push(setTimeout(() => {
        const f = list[Math.min(i, list.length - 1)];
        c.clearRect(0, 0, cv.width, cv.height);
        c.drawImage(f.canvas, (cv.width - f.width * s) / 2, (cv.height - f.height * s) / 2, f.width * s, f.height * s);
      }, i * MARK_FRAME_MS));
    }
    this.xTimers.push(setTimeout(() => { cv.remove(); }, MARK_LIFE_MS));
  },

  /* Which of the four cross frames a mark shows `age` milliseconds after it was
     made: 0..3 in 100ms steps, exactly the client's crossIndex / 100. */
  crossFrame(set, age) {
    const list = this.crosses && this.crosses[set === MARK_ACTION ? "action" : "walk"];
    if (!list || !list.length) return null;
    const i = Math.max(0, Math.min(list.length - 1, Math.floor(age / MARK_FRAME_MS)));
    return list[i];
  },

  clearMarkers() {
    this.marks.length = 0;
  },

  clear() {
    this.splats.length = 0;
    this.marks.length = 0;
  },

  render(camera, entities, focus) {
    const ctx = this.ctx;
    if (!ctx) return;
    /* the platform's preview can change the viewport without firing a resize
       event, so re-measure now and then rather than trusting the listener */
    if ((this._tick = ((this._tick || 0) + 1) & 15) === 0) this.resize();
    const cam = camera || this.camera;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, this._vw, this._vh);
    if (cam) this.renderMarks(ctx, cam);
    if (cam) this.renderGuide(ctx, cam);
    /* the bars are plain rectangles, so they do not wait on the baked assets */
    if (cam && entities) this.renderBars(ctx, cam, entities, focus);
    if (cam && entities) this.renderOverheads(ctx, cam, entities);
    if (cam && entities) this.renderLabels(ctx, cam, entities);
    if (!this.ready || !cam || !this.splats.length) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }

    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";

    const vw = this._vw;
    const vh = this._vh;
    const v = this._v;
    const v2 = this._v2;
    const o = this.origin;

    for (const splat of this.splats) {
      const e = splat.e;
      const ch = e.ch;
      if (!ch || !ch.group) continue;
      /* Past the overhead range no number draws - ahead of the visibility
         test below, so a far corpse's killing blow stays quiet too. */
      if (!this.nearOverhead(e, focus)) continue;
      /* Invisibility normally means "do not draw", but a dying creature is the
         exception: the killing blow creates its damage number on exactly the
         frame the death begins, and the corpse is still drawn in place while
         its fall plays out before src/game.js#updateVisuals takes it away
         (src/combat.js#killNpc). A splat on a dying creature is drawn from the
         body's last position, which the entity still carries (killNpc leaves it
         where it fell so the respawn clock and the camera's neighbours read it
         there). LOD-hidden creatures in the distance are still skipped, since a
         splat belongs to something close enough to have been hit. */
      if (!ch.group.visible && !e.dead) continue;
      const wx = e.rx == null ? e.x : e.rx;
      const wz = e.rz == null ? e.z : e.rz;
      const feet = ch.group.position.y;
      const h = ch.height || 1;
      v.set(wx, feet + h / 2, wz).project(cam);
      if (v.z > 1) continue;
      const cx = (v.x * 0.5 + 0.5) * vw;
      const cy = (-v.y * 0.5 + 0.5) * vh;
      if (cx < -64 || cy < -64 || cx > vw + 64 || cy > vh + 64) continue;
      /* one universal size for every splat, every target, every zoom level */
      const s = SPLAT_SCALE;

      /* The client's splat is blitted from the sprite sheet at whole-pixel
         coordinates (`spriteDrawX - 12`, both ints), so its 24x23 frame and the
         11px numerals land 1:1 and stay crisp. A projected world position is
         almost never on a whole pixel, and blitting a sprite and a bitmap font
         at a fractional offset resamples both: the number smears into the blob
         and is hard to read. Rounding the anchor once, here, restores the
         client's own crisp blit. */
      const off = SLOT_OFFSETS[splat.slot] || SLOT_OFFSETS[0];
      const ax = Math.round(cx) + off[0] * s;
      const ay = Math.round(cy) + off[1] * s;

      const frame = this.frames[splat.kind];
      const x = ax - o * s + frame.offsetX * s;
      const y = ay - o * s + frame.offsetY * s;
      ctx.drawImage(frame.canvas, x, y, frame.width * s, frame.height * s);

      /* the client draws the number twice: black at (anchor, anchor + 4), then
         white one pixel up and left — white text with a drop shadow.
         The centring is rounded for the same reason the anchor is: an odd
         label is an odd number of pixels wide, so `tw / 2` lands on a half
         pixel and the bitmap glyphs get resampled into a smear - which is
         exactly the two-digit numbers a real fight produces. */
      const label = String(Math.abs(splat.amount));
      const black = this.text(label, BLACK);
      const white = this.text(label, WHITE);
      /* The plate is taller than the line - it has to hold g/y/p/q tails (see
         Fx#plate) - so it is scaled by its own height while the *line* keeps
         the anchor it always had, and the numerals land on the same rows. */
      const tw = black.width;
      const th = black.height;
      const tx = Math.round(ax - (tw * s) / 2);
      const ty = Math.round(ay + 4 * s - this.font.fontHeight * s);
      ctx.drawImage(black, tx, ty, tw * s, th * s);
      ctx.drawImage(white, tx - s, ty - s, tw * s, th * s);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },

  /* Raise an entity's overhead health bar for the usual few seconds without
     drawing anything at all. A hitsplat does this as a side effect (see
     `hitsplat`), and it is what a creature whose health has just been changed
     under somebody else's blows needs - the bar has to keep showing while it
     ticks down, and there is no splat of our own to raise it
     (src/game.js#applyNpcStates). */
  showBar(entity) {
    if (entity) {
      entity.hpBarUntil = performance.now() + BAR_LIFE_MS;
      if (!entity.ps) entity.barTicks = BAR_TICKS;
    }
  },

  /* An entity's hit points and its maximum, in the one shape both kinds of
     creature can be read through: the player keeps its figures on the player
     state (see src/player.js), a creature on its own record (src/game.js). */
  hpOf(e) {
    if (!e) return null;
    if (e.ps) return { hp: e.ps.hp, max: e.ps.maxHp };
    const max = e.stats && e.stats.hp;
    if (max == null) return null;
    return { hp: e.hp, max };
  },

  /* The overhead health bar, one per creature that deserves one. As the client
     draws it: a 30x5 pixel box hung off the creature's crown (see BAR_W), red
     for what has been lost with green over it for what is left, and one black
     border pixel so the bar never disappears into the terrain - which is this
     world's own addition to the client's two rectangles. It never scales with
     the camera, and it never hangs below BAR_FLOOR_TILES. Once drawn, the bar
     is pinned: nothing about the creature's surroundings moves it. Nothing here
     depends on the baked sprite assets, so it draws even before those load.

     A creature that has just died keeps its bar, run all the way down to red,
     for as long as its body is still on screen: the killing blow empties the
     bar, the bar stays pinned over the body while the death sequence falls
     (src/game.js#updateVisuals), and the two go together the instant the body
     is removed. The bar must not blink out on the killing tick - the last
     thing seen over a kill is the empty red bar, never a bar that vanishes
     out from under a body that is still falling. */
  renderBars(ctx, cam, entities, focus) {
    if (!cam || !entities || !entities.length) return;
    const now = performance.now();
    /* who is owed a bar: the target and the hovered creature carry one on their
       own, anything else needs to have been hit in the last few seconds - and a
       body still on screen (dying or awaiting respawn) always carries one */
    const list = [];
    for (const e of entities) {
      if (!e) continue;
      if (!this.nearOverhead(e, focus)) continue;
      const ch = e.ch;
      /* the model group is the clock the bar lives on: it is hidden the moment
         the death sequence has played out (src/game.js#updateVisuals), and the
         bar leaves with it */
      if (!ch || !ch.group || !ch.group.visible) continue;
      const dying = !!(e.dead || e.corpse);
      /* One rule for the player and every creature alike: the current target
         carries a fresh bar on its own, anything else needs a hit in the last
         BAR_LIFE_MS (stamped by `hitsplat`/`showBar` - the client's own
         `loopCycleStatus = tick + 300` at 50 Hz, i.e. 6 s refreshed by every
         hit). The hovered creature always carries a bar, but only a ghost of
         one once it is neither the target nor recently hit: same box, half
         alpha, grey border. The fresh-to-ghost step is the visible state
         change when the fight ends under a cursor that never moved. A
         creature's BAR_TICKS countdown is NOT the bar - it is the fuse on its
         retaliation delay (src/combat.js) - so the bar no longer reads it. */
      const fresh = (e === this.focus || (e.hpBarUntil || 0) > now);
      const ghost = (!fresh && e === this.hover);
      if (!dying && !fresh && !ghost) continue;
      const info = this.hpOf(e);
      if (!info || !(info.max > 0)) continue;
      list.push({ e, ghost: (!dying && ghost) });
    }
    if (!list.length) return;
    for (const { e, ghost } of list) {
      const ch = e.ch;
      const info = this.hpOf(e);
      const a = this.overlayAnchor(e, cam, BAR_FLOOR_TILES);
      if (!a) continue;
      /* the client's own 30x5 box, at the client's own offsets from the anchor */
      const w = BAR_W;
      const h = BAR_H;
      const bx = Math.round(a.x + BAR_DX);
      /* pinned at row 1 so a bar on a tall creature keeps its own top border
         row at 0 rather than being cut off the top of the screen */
      const by = Math.max(1, Math.round(a.y + BAR_DY));
      if (bx < -w || by < -h * 2 || bx > this._vw || by > this._vh + h * 2) continue;
      const frac = Math.max(0, Math.min(1, info.hp / info.max));
      if (ghost) ctx.save(), ctx.globalAlpha = BAR_GHOST_ALPHA;
      ctx.fillStyle = ghost ? BAR_GHOST_BORDER : BAR_BORDER;
      ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
      ctx.fillStyle = BAR_BG;
      ctx.fillRect(bx, by, w, h);
      /* a creature with any health left always shows at least a sliver of
         green: a bar that reads as empty at full health would be a lie */
      const fw = info.hp > 0 ? Math.max(1, Math.round(w * frac)) : 0;
      if (fw > 0) {
        ctx.fillStyle = BAR_FILL;
        ctx.fillRect(bx, by, fw, h);
      }
      if (ghost) ctx.restore();
    }
  },

  /* Whether an entity is close enough to the camera's focus to earn an
     overhead mark (see OVERHEAD_RANGE): squared tiles, no sqrt, read off the
     drawn position. No focus - a caller that projects without a camera
     target - means no culling. */
  nearOverhead(e, focus) {
    if (!focus || focus.x == null) return true;
    const ex = e.rx == null ? e.x : e.rx, ez = e.rz == null ? e.z : e.rz;
    if (ex == null || ez == null) return true;
    const dx = ex - focus.x, dz = ez - focus.z;
    return dx * dx + dz * dz <= OVERHEAD_RANGE2;
  },

  /* The one point every overhead mark hangs off, or null when the creature is
     behind the camera. Every painter below measures off this and nothing else,
     which is what keeps the bar, the icon and the name on one axis. */
  overlayAnchor(e, cam, floor) {
    const ch = e && e.ch;
    if (!ch || !ch.group || !ch.group.visible) return null;
    const wx = e.rx == null ? e.x : e.rx;
    const wz = e.rz == null ? e.z : e.rz;
    const crown = Math.max(ch.height || 1, floor || 0) + OVERLAY_HEAD_UNITS;
    const v = this._v || (this._v = new THREE.Vector3());
    v.set(wx, ch.group.position.y + crown, wz).project(cam);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * this._vw, y: (-v.y * 0.5 + 0.5) * this._vh };
  },

  /* The icon's box for an entity, in screen pixels, or null when it has none -
     the part to blit and the fixed offsets the client plots it at (see
     OVERHEAD_SIZE). Shared with renderLabels, which stacks the name and any
     spoken line *above* the icon rather than through it: the two painters read
     the same box on the same frame, so the stack cannot come apart. */
  overheadIcon(e) {
    if (!this.overheadPart) return null;
    const part = this.overheadPart(e);
    if (!part) return null;
    return { part, size: OVERHEAD_SIZE, dx: OVERHEAD_DX, dy: OVERHEAD_DY };
  },

  /* The overhead prayer icon - one per creature that has an overhead prayer up,
     which in this world is only ever the local player (src/prayer.js#overheadPrayer
     is read through the `overheadPart` hook src/ui.js installs, so this file
     knows nothing about prayers or about the sprite atlas). */
  renderOverheads(ctx, cam, entities) {
    if (!this.overheadPart || !this.drawPart || !cam || !entities || !entities.length) return;
    for (const e of entities) {
      if (!e) continue;
      const icon = this.overheadIcon(e);
      if (!icon) continue;
      const a = this.overlayAnchor(e, cam, 0);
      if (!a) continue;
      const ix = Math.round(a.x + icon.dx);
      const iy = Math.round(a.y + icon.dy);
      if (ix < -icon.size || iy < -icon.size || ix > this._vw || iy > this._vh) continue;
      /* pixel art blitted 1:1 - the same nearest-neighbour rule the interface
         sprites and item icons get */
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      this.drawPart(ctx, icon.part, ix, iy, icon.size, icon.size);
      ctx.imageSmoothingEnabled = smooth;
    }
  },

  /* Overhead labels: the name under which somebody is known (white, or grey once
     they have switched away from their tab - see AFK_NAME_COLOR), and above it
     whatever they have just said (yellow - the client's own colour for a spoken
     line). A ghost carries `name` from its join packet (src/net.js) and
     `chatText`/`chatUntil` from a chat packet or, for you, from your own typing
     (src/game.js#sayOverhead). The local player deliberately has no name - you
     know who you are, and the live game does not label you either - but *does*
     get their own line echoed over their head, which is what makes typing
     something feel like speaking rather than filing a report.

     The stack reads bottom-up from the crown: chat lines (oldest highest, so the
     newest is the one by the head), then the name. A body with no name - you -
     puts its chat on the name's own line, so nothing floats a gap above a head
     for no reason.

     The labels are drawn with the cache's own 12px bold interface font, blitted
     glyph by glyph from the baked mask (src/sprites/ui/fonts.json) rather than
     handed to the browser: this overlay *is* the client's 512x334 and the frame
     upscales it, so glyphs the browser anti-aliased arrive with soft fringes
     that the upscale smears into a doubled, out-of-focus line. The mask's glyphs
     are hard-edged, so a label reads like every other pixel on this canvas. Only
     a character the mask does not carry falls back to browser text.

     Drawing into the 2D overlay rather than the DOM keeps labels on the same
     clock and projection as the bars and hitsplats, so a line can never drift a
     frame away from the head it belongs to. */
  renderLabels(ctx, cam, entities) {
    if (!cam || !entities || !entities.length) return;
    const now = Date.now();
    for (let ei = 0; ei < entities.length; ei++) {
      const e = entities[ei];
      if (!e) continue;
      const said = e.chatText && e.chatUntil > now ? wrapChat(e.chatText, CHAT_LINE_CHARS, CHAT_MAX_LINES) : null;
      const label = e.hideLabel ? null : e.name;
      if (!label && (!said || !said.length)) continue;
      const a = this.overlayAnchor(e, cam, NAME_FLOOR_TILES);
      if (!a) continue;
      const icon = this.overheadIcon(e);
      const lift = icon ? -icon.dy + OVERHEAD_LABEL_GAP : 0;
      const ty = Math.round(a.y - NAME_GAP_PX - lift);
      const tx = Math.round(a.x);
      if (tx < -80 || tx > this._vw + 80 || ty < -24 || ty > this._vh + 24) continue;
      const lines = said ? said.length : 0;
      const shift = label ? 1 : 0;
      for (let i = 0; i < lines; i++) {
        this.labelText(ctx, said[i], tx, ty - CHAT_LINE * (lines - 1 - i + shift), CHAT_COLOR);
      }
      if (label) this.labelText(ctx, label, tx, ty, e.away ? AFK_NAME_COLOR : NAME_COLOR);
    }
  },

  /* The click cross: a pure screen-space overlay. A cursor mark carries its own
     viewport pixels and is simply blitted there; a world mark is projected each
     frame so it tracks the ground (Fx.setMarker still supports those for a
     caller that marks a tile, but no screen in the UI does today - a minimap
     click paths the player without marking the viewer). Either way
     the client's own 16x16 cross cell is drawn at 1:1 with its own art offset -
     the cell carries its black outline in its pixels, which is why the mark
     reads clearly over grass, sand and water alike. The four frames ARE the
     animation, so there is nothing to fade. */
  renderMarks(ctx, cam) {
    if (!this.marks.length || !this.crosses) return;
    const v = this._v || (this._v = new THREE.Vector3());
    const now = performance.now();
    for (const m of this.marks) {
      const age = now - m.born;
      if (age >= MARK_LIFE_MS) continue;
      const frame = this.crossFrame(m.set, age);
      if (!frame) continue;
      let cx, cy;
      v.set(m.x, m.y, m.z).project(cam);
      if (v.z > 1) continue;
      cx = (v.x * 0.5 + 0.5) * this._vw;
      cy = (-v.y * 0.5 + 0.5) * this._vh;
      const x = cx - MARK_ORIGIN + frame.offsetX;
      const y = cy - MARK_ORIGIN + frame.offsetY;
      if (x < -32 || y < -32 || x > this._vw + 32 || y > this._vh + 32) continue;
      ctx.drawImage(frame.canvas, x, y, frame.width, frame.height);
    }
  },

  /* A one-pixel-per-glyph render of `text` in `colour`, built from the baked
     masks and cached (damage numbers repeat constantly). */
  text(str, colour) {
    return this.plate("splat", this.font, str, colour);
  },

  /* One overhead label: the black offset copy first, then the coloured line over
     it - the client's own one-pixel drop shadow. Both copies are blitted from
     the baked bold 12 mask (`plate`), centred on `cx` and standing on the
     alphabetic `ty` the caller placed, so a label always lands on whole pixels.
     A line carrying a character the mask does not have (nothing in this world
     does - the cache's 95 glyphs are plain ASCII) keeps the browser's own text
     rather than dropping the glyph. */
  labelText(ctx, text, cx, ty, colour) {
    const f = this.labelFont;
    const str = String(text);
    let ok = !!f;
    if (ok) for (const ch of str) if (!f.has(ch)) { ok = false; break; }
    if (!ok) {
      ctx.font = NAME_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      if (RenderOptions.textShadow) {
        ctx.fillStyle = NAME_SHADOW;
        ctx.fillText(str, cx + 1, ty + 1);
      }
      ctx.fillStyle = colour;
      ctx.fillText(str, cx, ty);
      return;
    }
    const plate = this.plate("label", f, str, colour);
    const x = Math.round(cx - plate.width / 2);
    const y = Math.round(ty) - (f.fontHeight - 1);
    if (RenderOptions.textShadow) {
      ctx.drawImage(this.plate("label", f, str, NAME_SHADOW), x + 1, y + 1);
    }
    ctx.drawImage(plate, x, y);
  },

  /* One string rendered at one pixel per glyph from the mask `f`, tinted
     `colour` and cached by (kind, colour, string): damage numbers, names and
     chat lines all repeat constantly. The plate is `f.boxHeight` tall, not
     `fontHeight`: the tails of g/y/p/q/j live below the baseline row and a
     shorter plate cuts them off. */
  plate(kind, f, str, colour) {
    const key = kind + "|" + colour + "|" + str;
    let cv = this._textCache.get(key);
    if (cv) return cv;
    const w = Math.max(1, f.width(str));
    const h = f.boxHeight || f.fontHeight;
    cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d");
    let pen = 0;
    for (const ch of str) {
      const g = f.glyph(ch);
      if (g && g.w > 0) c.drawImage(f.atlas, g.x, g.y, g.w, g.h, pen + g.ox, g.oy, g.w, g.h);
      pen += g ? g.adv : 0;
    }
    c.globalCompositeOperation = "source-in";
    c.fillStyle = colour;
    c.fillRect(0, 0, w, h);
    if (this._textCache.size > 240) this._textCache.clear();
    this._textCache.set(key, cv);
    return cv;
  },
};

function makeFrame(f) {
  const raw = atob(f.rgba);
  const rgba = new Uint8ClampedArray(raw.length);
  for (let i = 0; i < raw.length; i++) rgba[i] = raw.charCodeAt(i);
  const cv = new OffscreenCanvas(f.width, f.height);
  const c = cv.getContext("2d");
  c.putImageData(new ImageData(rgba, f.width, f.height), 0, 0);
  return { canvas: cv, width: f.width, height: f.height, offsetX: f.offsetX, offsetY: f.offsetY, kind: f.kind };
}

export function makeFont(data) {
  const raw = atob(data.alpha);
  const aw = data.atlas.width || data.atlas.w;
  const ah = data.atlas.height || data.atlas.h;
  const alpha = new Uint8ClampedArray(raw.length * 4);
  for (let i = 0; i < raw.length; i++) {
    const a = raw.charCodeAt(i);
    alpha[i * 4] = 255;
    alpha[i * 4 + 1] = 255;
    alpha[i * 4 + 2] = 255;
    alpha[i * 4 + 3] = a;
  }
  const cv = new OffscreenCanvas(aw, ah);
  cv.getContext("2d").putImageData(new ImageData(alpha, aw, ah), 0, 0);
  const byChar = new Map();
  for (const g of data.glyphs) byChar.set(String.fromCharCode(g.ch), g);
  const space = byChar.get(" ");
  /* How far down a glyph may actually reach. The cache's `fontHeight` measures
     the baseline side only: 'g', 'y', 'p', 'q' and 'j' all carry their tails in
     rows *below* it (bold12's 'g' is oy 6 + h 10 = row 16 against a fontHeight
     of 12, its 'j' row 16 too), so a plate cut to `fontHeight` beheads every
     descender - which is exactly what it did. See Fx#plate. */
  let boxHeight = data.fontHeight;
  for (const g of data.glyphs) boxHeight = Math.max(boxHeight, g.oy + g.h);
  return {
    atlas: cv,
    fontHeight: data.fontHeight,
    boxHeight,
    ascent: data.ascent,
    glyph(ch) { return byChar.get(ch) || space; },
    /* whether the atlas carries this character at all - a run with a character
       it does not carry cannot be blitted and keeps the browser's own text */
    has(ch) { return byChar.has(ch); },
    width(str) {
      let w = 0;
      for (const ch of str) {
        const g = byChar.get(ch) || space;
        w += g ? g.adv : 0;
      }
      return w;
    },
  };
}
