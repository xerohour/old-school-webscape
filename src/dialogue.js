/* ----------------------------------------------------------------- dialogue

   The chatbox, when somebody is talking. Every box here is a transcription of
   cache revision 241's own chatbox interfaces - the same archive src/tools/
   cache-bake/iface.mjs reads out of index 3 - component for component, so an
   NPC's name sits where the client puts it (#800000 at x 111, in quill 8) and
   the head is framed by the model widget's own zoom and rotation rather than by
   anything a screenshot suggests. The interfaces, and what each is for:

     | id          | what it is                                              |
     | ----------- | ------------------------------------------------------- |
     | 241/242/243/244 | an NPC speaking, 1 to 4 lines. Head model on the LEFT |
     | 64/65/66/67 | the same box 1 to 4 lines, head on the RIGHT - the     |
     |             | player's own answers                                   |
     | 210-214     | the "statement" box, 1 to 5 lines, no head: narration  |
     |             | and the world's own messages                           |
     | 228, 230,    | "Select an Option": the 2, 3, 4 and 5 option lists     |
     | 232, 234    |                                                        |

   Three things are worth writing down, because each of them was read out of the
   cache rather than assumed:

     * **The two head boxes are mirror images.** 241's head widget is at x 34
       (left of the 350-wide text column at x 111); 64's is at x 414 (right of a
       text column at x 20). Both are 32x32 at y 34 with modelZoom 796 and a
       pitch of 40, but their yaw - the widget's third model field, which the
       317 client calls `modelRotationY` - is 1882 on the NPC box and 166 on the
       player box. Those are negatives of each other (1882 = 1024 - 166 mod
       1024), which is exactly the difference between a head turned to face text
       on its right and one turned to face text on its left. See
       src/scene.js#drawChatHead for how the yaw is applied to the model.
     * **The line spacing follows the line count, not a fixed pitch.** One line
       sits on y 40, two on 28/56, three on 20/40/60 and four on 16/32/48/64: the
       block is centred in the 96px chatbox rather than stacked from the top.
       The statement boxes do the same with their own five spacings (210 to 214).
     * **The option list's only art is two swords.** Interface 228 holds its
       title and its option lines, and then two type-0 containers each holding
       two 57x13 sword sprites (302 on the left pointing right, 301 on the right
       pointing left) with *nothing between them* - the client's drawInterface
       has no background for a container, and there is no wide thin sprite in
       index 8 to tile. The narrow container (72..409) is the one drawn; the
       wider one (2..478, 476 wide) is the cache's "hidden until hover" widget,
       so hovering the bar swings the swords out to the edges of the chatbox.

   The engine underneath is a flat queue of "screens". Each screen is one
   interface's worth of content, and the player's click moves to the next one:

     { who: "npc" | "player" | "statement",   who is speaking (default "npc")
       name: "Hans",                          defaults to the speaker's name
       lines: ["...", "..."],                 1-4 lines in the head boxes,
                                              1-5 in a statement
       next: [screens] | fn | "end",          where "Click here to continue" goes
       options: [{ text, go }],               an option list instead of/after the
                                              lines; `go` is the same shape as
                                              `next`
       title: "Select an Option",
       onShow: fn }                           run as the screen appears

   A screen may carry both `lines` and `options`: the lines are shown first and
   the options follow when the player clicks through, which is how the cache
   itself has to do it (the option list is its own interface). `next` and `go`
   replace the queue with a new branch, so a conversation tree is just nested
   arrays of screens; "end", or running out of screens, closes the chatbox.
*/

import * as THREE from "https://esm.sh/three@0.160.0";
import { Game, npcModelKey, NPC_NAMES, sayOverhead, playCastAnim, walkTo, NO_MODS } from "./game.js";
import { Gfx } from "./gfx.js";
import { kit, closeChatDialog, setChatDialogOpen, extraSetting } from "./ui.js";
import { headData, makeStaticMesh, ensureFallbackHead, chatAnimName, hasHeldModel } from "./models3d.js";
import { buildKitHead, buildHeadgearHead } from "./identikits.js";
import { archetypeByKey, archetypeAppearance } from "./archetypes.js";
import { locGeometry, ICON_KEY } from "./locmodels.js";
import { setTutStage } from "./player.js";
import { LEVELUP_BOX, levelupScreen } from "./levelup.js";

const { mk, place, pxText, pxSprite, chat, UI } = kit;

/* The cache's font ids: 494 plain11, 495 plain12, 496 bold12, 497 quill8. Every
   dialogue interface is 497. */
const QUILL = "quill8";
const hex = (c) => "#" + (c >>> 0).toString(16).padStart(6, "0");

/* --- the interfaces themselves ------------------------------------------ */

/* The head widget and the two head-box layouts. `headY` is the widget's own y
   in both variants; the text column differs (111 with a left head, 20 with a
   right head) and so does the head's x. */
const HEAD_W = 32;
const HEAD_Y = 34;
const HEAD_ZOOM = 796;
const HEAD_PITCH = 40;
const NPC_YAW = 1882;
const PLAYER_YAW = 166;

const NPCS_BOX = { headX: 34, textX: 111, textW: 350 };
const PLAYER_BOX = { headX: 414, textX: 20, textW: 350 };

/* The line rows, keyed by how many lines there are. Interfaces 241-244 for the
   head boxes and 210-214 for the statements. Every head-box block is centred
   on the box's vertical middle the user's way: the block's middle is the
   1-line row (40), so 2 lines straddle it ([27,53], 26px pitch) and 3 lines
   put their middle line on it ([20,40,60], cache-exact), and the 4-line set
   ([16,32,48,64], cache-exact) centres the same way. */
const HEAD_ROWS = { 1: [40], 2: [27, 53], 3: [20, 40, 60], 4: [16, 32, 48, 64] };
/* The 2-line box's "Click here to continue" keeps the 26px pitch: the last row
   lands on 53, so the continue sits on 79, one below the other head boxes'
   80. */
const HEAD_CONT_Y = { 1: 80, 2: 79, 3: 80, 4: 80 };
const STATEMENT_ROWS = {
  1: { rows: [40], contX: 69, contY: 77 },
  2: { rows: [26, 54], contX: 69, contY: 77 },
  3: { rows: [5, 29, 53], contX: 69, contY: 77 },
  4: { rows: [9, 25, 41, 57], contX: 65, contY: 77 },
  5: { rows: [0, 16, 32, 48, 64], contX: 65, contY: 80 },
};
const STATEMENT_X = 21;
const STATEMENT_W = 441;

/* The option lists: interfaces 228 (two options), 230 (three), 232 (four) and
   234 (five). The title's box is 480x17 on y -1; the option rows are 480 wide
   and centred, and their spacing tightens as the list grows. The row block is
   centred on the box's vertical middle the user's way, like the speech lines:
   the block's middle is the 1-line row (40), so 2 rows straddle it ([25,55])
   and 3 rows put their middle row on it ([18,40,62]). 4/5-row lists keep the
   cache's rows. */
const OPTION_TITLE = { x: 0, y: -1, w: 480, h: 17 };
const OPTION_LISTS = {
  2: { rows: [25, 55], h: 17 },
  3: { rows: [18, 40, 62], h: 17 },
  4: { rows: [16, 36, 56, 76], h: 17 },
  5: { rows: [15, 31, 47, 63, 79], h: 16 },
};
/* The two sword bars: the cache's own two containers, narrow (the one drawn)
   and wide (its hidden-until-hover twin). */
const SWORDS_NARROW = { left: 72, right: 352, y: 1 };
const SWORDS_WIDE = { left: 2, right: 421, y: 1 };
const SWORD_SIZE = { w: 57, h: 13 };

/* The cache's own colours for every dialogue text component: the name is dark
   red, the lines are black, "Click here to continue" is blue and turns white
   under the pointer (its `colourDefaultHover` is 0xffffff while the name's and
   the lines' are 0, i.e. "no hover colour" - which is why only the continue line
   and the options light up). */
const C_NAME = 0x800000;
const C_LINE = 0x000000;
const C_CONT = 0x0000ff;
const C_HOVER = 0xffffff;

/* --- rendering ---------------------------------------------------------- */

/* One quill-8 text component: the interface's own box, centred on its own x and
   width, on the client's own baseline (pxText's `padTop` convention puts our
   baked font's baseline one pixel above the client's cell bottom, exactly as
   every other widget in this project does). The client draws these widgets with
   `textShadowed = false`, so they carry no shadow. */
function qtext(panel, str, x, y, w, h, colour, hover) {
  const e = pxText(panel, str, x, y, w, h, { font: QUILL, color: hex(colour), align: 1, shadow: false });
  if (hover) {
    /* The interface components themselves are `pointer-events: none` (the
       chatbox's click handler does the advancing), so an interactive line - the
       one that lights up, the options - has to opt back in to hear the pointer
       at all. */
    e.style.pointerEvents = "auto";
    e.addEventListener("pointerenter", () => { e.style.color = hex(hover); });
    e.addEventListener("pointerleave", () => { e.style.color = hex(colour); });
  }
  return e;
}

/* The head: a canvas centred on the widget's own 32x32 box, drawn by the
   character renderer (src/scene.js#drawChatHead) at the widget's zoom, pitch and
   yaw. The canvas is bigger than the widget because the head is: the client's
   focal is 512 pixels per model unit at a `modelZoom` distance of 796, so a
   126-unit head projects to 81 pixels - the widget's 32x32 box is only the
   anchor its centre is taken from (`Rasterizer.centreX = x + width / 2`). A
   speaker with no baked head model is portrait-framed from its body instead
   (see `ensureFallbackHead`), so the box is never empty. The head is **animated** while it is up: see
   `headTick` below for the one loop that poses and repaints it. */
const HEAD_DRAW = 96;

function headWidget(panel, x, yaw, key, expr, nlines) {
  if (!key) return null;
  const cv = mk("canvas", "dlgHead");
  cv.width = HEAD_DRAW;
  cv.height = HEAD_DRAW;
  place(cv, x + HEAD_W / 2 - HEAD_DRAW / 2, HEAD_Y + HEAD_W / 2 - HEAD_DRAW / 2, HEAD_DRAW, HEAD_DRAW);
  panel.appendChild(cv);
  drawHeadInto(cv, key, yaw, HEAD_PITCH);
  const mesh = headMesh(key);
  const anim = chatAnimName(key, expr, nlines);
  if (mesh) {
    liveHeads.push({ cv, key, yaw, mesh, anim: anim || null, born: performance.now() });
    if (!headLoop) { headLast = performance.now(); headAcc = 0; headLoop = requestAnimationFrame(headTick); }
  }
  return cv;
}

function drawHeadInto(cv, key, yaw, pitch, dy) {
  if (!key) return;
  const mesh = headMesh(key);
  const view = Game.view;
  if (!mesh || !view || !view.drawChatHead) return;
  const zoom = (mesh.userData && mesh.userData.headZoom) || HEAD_ZOOM;
  view.drawChatHead(mesh, cv, { zoom, pitch: pitch != null ? pitch : HEAD_PITCH, yaw, dy: dy || 0 });
}

/* --- animating the head widget ------------------------------------------

   A chat head is an *animated* model widget, not a still: the server answers
   the interface's own "give me a head" model with IF_SETANIM, and the client
   advances that sequence once per cycle - which is why every head is baked
   against its speaker's own idle sequence (src/tools/cache-bake/
   heads-bake-run.mjs) rather than as a rest pose. So the widget poses its mesh
   over time exactly as a body out in the world does (src/models3d.js#update,
   whose character wrapper makeStaticMesh keeps for this), and re-draws the
   canvas the renderer painted it into.

   One loop for every head on the box - there is never more than one, the head
   boxes have a single head widget each - and it retires a head the moment its
   canvas leaves the document, which is precisely what `showScreen` does to the
   previous screen's components (it empties the box rather than hiding it). The
   pose is advanced and the canvas repainted at the widget's own rate rather
   than the display's: the cache's idle sequences step every 3 to 21 cycles
   (60-420ms a frame), so 30 repaints a second is already finer than the art,
   and it keeps the renderer's read-back - the one GPU sync this project makes
   every frame - off the critical path on a slow device. */
const HEAD_REDRAW_HZ = 30;

const liveHeads = [];
let headLoop = 0;
let headLast = 0;
let headAcc = 0;

function headTick(now) {
  const dt = Math.min(0.2, Math.max(0, (now - headLast) / 1000));
  headLast = now;
  for (let i = liveHeads.length - 1; i >= 0; i--) {
    if (!liveHeads[i].cv.isConnected) liveHeads.splice(i, 1);
  }
  if (!liveHeads.length) { headLoop = 0; headAcc = 0; return; }
  headAcc += dt;
  if (headAcc >= 1 / HEAD_REDRAW_HZ) {
    const step = headAcc;
    headAcc = 0;
    for (const hp of liveHeads) {
      try {
        const built = hp.mesh.userData && hp.mesh.userData.built;
        if (built) built.update(step, hp.anim ? { cast: hp.anim, castToken: hp.born, castLoop: true, flat: true } : { flat: true });
        drawHeadInto(hp.cv, hp.key, hp.yaw, HEAD_PITCH, 0);
      } catch (e) { /* one bad head must not still the loop for the rest */ }
    }
  }
  headLoop = requestAnimationFrame(headTick);
}

/* --- the three boxes ---------------------------------------------------- */

function renderSpeech(d, box, name, lines, head, expr) {
  const n = Math.max(1, Math.min(4, lines.length));
  const rows = HEAD_ROWS[n];
  headWidget(d, box.headX, head.yaw, head.key, expr, n);
  /* The name sits on the interface top, not below it: with the name's top at
     y 0 its pitch to the first row matches the rows' own pitch and the last
     row's pitch to "Click here to continue" (4 lines: 16px throughout;
     3 lines: 20px; 2 lines: 26px with the continue one below the others' 80;
     1 line: 40px), so every gap in the box is the same.
     The glyphs themselves sit lower than the box top (pxText's padTop
     convention puts the baseline a pixel above the cell bottom), keeping them
     clear of the stone edge's ~7px dark jags. */
  if (name) qtext(d, name, box.textX, 0, box.textW, 17, C_NAME);
  for (let i = 0; i < lines.length && i < rows.length; i++) {
    qtext(d, lines[i], box.textX, rows[i], box.textW, 17, C_LINE);
  }
  const cont = qtext(d, "Click here to continue", box.textX, HEAD_CONT_Y[n], box.textW, 17, C_CONT, C_HOVER);
  cont.dataset.advance = "1";
}

function renderStatement(d, lines) {
  const spec = STATEMENT_ROWS[Math.max(1, Math.min(5, lines.length))];
  for (let i = 0; i < lines.length && i < spec.rows.length; i++) {
    qtext(d, lines[i], STATEMENT_X, spec.rows[i], STATEMENT_W, 17, C_LINE);
  }
  const cont = qtext(d, "Click here to continue", spec.contX, spec.contY, 350, 17, C_CONT, C_HOVER);
  cont.dataset.advance = "1";
}

/* ------------------------------------------------- the level-up interface

   Cache 157..177, one per skill - a chatbox interface with two q8 text lines
   (the message and the new level), a 3D icon widget, and the client's own
   "Click here to continue" pause button. Every box, model, zoom and rotation is
   in src/levelup.js, transcribed from the cache; what is transcribed *here* is
   the drawing: the interface is inside the same 479x96 chatbox the other
   dialogue interfaces use (`#chatDialog`), the two lines are centred in their
   own 390px components and the prompt in its own 350px one (both `xAlign = 1`),
   the glyphs come from quill 8 with `textShadowed = false`, and the icon is a
   real render of the widget's own model.

   The icon canvas: the widget's box is 32x32, but the client draws the model
   into the interface's shared pixel buffer rather than clipping to that box, so
   a canvas a little larger than the box is used and centred on it - the cache's
   own zoom is what decides how big the icon actually is (the camera focal is
   the same 512 pixels every chat head is drawn with, see drawChatHead). */
const ICON_BOX = 32;
/* The canvas is the model's own stage, as a chat head's is: the widget's 32x32
   box is an anchor, not a clip, and the cache's own zoom decides the size (a
   shortsword's 0.6-tile model at zoom 444 is ~50px, an anvil's 0.9-tile one at
   716 ~76px, a tree's 2.3-tile one at 1800 ~83px). 128px holds the largest of
   the 25 with room to spare; the model is centred on the widget's box, so only
   the outermost pixels of the biggest icons can meet the chatbox's own edge. */
const ICON_DRAW = 128;

const iconMeshes = new Map();

function iconMesh(key) {
  const view = Game.view;
  if (!view || !view.drawChatHead) return null;
  let m = iconMeshes.get(key);
  if (m === undefined) {
    /* `key` is the bake's own model key (src/levelup.js); the geometry lives
       under the icon namespace (src/locmodels.js) */
    const geom = locGeometry(ICON_KEY + key, 0);
    m = geom ? new THREE.Mesh(geom, view.locMat) : null;
    if (m) {
      /* the item/loc bake's own units, the same two numbers the chat heads
         carry (see models3d.js#makeStaticMesh and scene.js#drawChatHead). The
         widget centres the model's own bounding box rather than its foot - an
         item model's origin is its base - so the vertical offset is the box's
         centre. */
      geom.computeBoundingBox();
      const bb = geom.boundingBox;
      m.userData.modelScale = 1 / 128;
      m.userData.footY = bb ? (bb.min.y + bb.max.y) / 2 : 0;
    }
    iconMeshes.set(key, m);
  }
  return m;
}

function renderLevelUp(d, screen) {
  const sc = levelupScreen(screen.skill, screen.level);
  if (!sc) return;
  const b = LEVELUP_BOX;
  qtext(d, sc.line1, b.line1.x, sc.y1, b.line1.w, b.line1.h, C_LINE);
  qtext(d, sc.line2, b.line2.x, b.line2.y, b.line2.w, b.line2.h, C_LINE);
  for (const ic of sc.icons) {
    const cv = mk("canvas", "dlgIcon");
    cv.width = ICON_DRAW;
    cv.height = ICON_DRAW;
    place(cv, ic.x + ICON_BOX / 2 - ICON_DRAW / 2, ic.y + ICON_BOX / 2 - ICON_DRAW / 2, ICON_DRAW, ICON_DRAW);
    d.appendChild(cv);
    const mesh = iconMesh(ic.key);
    if (mesh) Game.view.drawChatHead(mesh, cv, { zoom: ic.zoom, pitch: ic.pitch, yaw: ic.yaw });
  }
  const cont = qtext(d, "Click here to continue", b.cont.x, b.cont.y, b.cont.w, b.cont.h, C_CONT, C_HOVER);
  cont.dataset.advance = "1";
}

/* A lone choice is spoken, not offered: the line becomes the player's own reply
   and continuing follows it, so no "Select an Option" box ever shows a single
   row. */
function singleOptionScreen(o) {
  return { who: "player", lines: [o.text], next: o.go };
}

/* Option pages. Five or fewer options show all at once; more paginate
   four-to-a-page, the last row being "More options", every later page leading
   with "Previous options". A middle page holds Previous + 3 options + More, so
   no page ever exceeds the five rows the cache's own option lists fit - a full
   middle chunk hands its last option to the next page, cascading as needed.
   Returns the display rows: {kind:"opt", i} addresses the real option, the
   other kinds are navigation. The page comes off the screen itself
   (`_optPage`, set by navigation, reset on fresh arrival in showScreen). */
const OPT_PAGE_SIZE = 4;
function pageOptions(screen) {
  const n = screen.options.length;
  if (n <= 5) return { rows: screen.options.map((_, i) => ({ kind: "opt", i })), page: 0, pages: 1 };
  const chunks = [];
  for (let s = 0; s < n; s += OPT_PAGE_SIZE) chunks.push(screen.options.map((_, i) => i).slice(s, s + OPT_PAGE_SIZE));
  for (let c = 1; c < chunks.length - 1; c++) {
    while (chunks[c].length > 3) chunks[c + 1].unshift(chunks[c].pop());
  }
  const p = Math.max(0, Math.min(chunks.length - 1, screen._optPage || 0));
  const rows = [];
  if (p > 0) rows.push({ kind: "prev" });
  for (const i of chunks[p]) rows.push({ kind: "opt", i });
  if (p < chunks.length - 1) rows.push({ kind: "more" });
  return { rows, page: p, pages: chunks.length };
}

function renderOptions(d, screen, page) {
  /* The row table follows the displayed row count, so every page - full or
     partial, options or navigation - is distributed and centred exactly the
     way the cache lays out that many rows. */
  const rows = page.rows;
  const list = OPTION_LISTS[Math.max(2, Math.min(5, rows.length))];
  const ys = list.rows;

  const titleText = screen.title || "Select an Option";
  qtext(d, titleText, OPTION_TITLE.x, OPTION_TITLE.y, OPTION_TITLE.w, OPTION_TITLE.h, C_NAME);

  /* The sword bar. It covers the option rows only - never the title row above
     them - so hovering "Select an Option" is not hovering an option: the title
     is text, and the swords swing for the options alone. (The cache draws a
     hidden-until-hover twin of the bar; this is that twin, cut down to the
     rows.) */
  const top = Math.max(OPTION_TITLE.y + OPTION_TITLE.h + 1, ys[0] - 4);
  const bot = ys[ys.length - 1] + list.h + 4;
  const bar = mk("div", "dlgBarHit");
  place(bar, SWORDS_WIDE.left, top, 476, bot - top);
  d.appendChild(bar);
  const titleHome = titleSwords(titleText);
  const left = pxSprite(d, "optionSwordLeft", titleHome.left, titleHome.top);
  const right = pxSprite(d, "optionSwordRight", titleHome.right, titleHome.top);
  const move = (spec) => {
    if (left) { left.style.left = spec.left + "px"; left.style.top = spec.top + "px"; }
    if (right) { right.style.left = spec.right + "px"; right.style.top = spec.top + "px"; }
  };
  const rest = () => move(titleHome);
  /* Roaming swords (the "Roaming swords in dialogue" switch): the pair jumps
     to flank whichever option the pointer is over - framing the line as it
     lights up white - and only sits back on the title when the pointer leaves
     the dialogue box itself, never on the way between two rows. Off, the bar
     below does the cache's own thing: swords on the title, swinging wide while
     the pointer is over the rows. */
  const roam = extraSetting("roamSwords");
  if (d._swordLeave) { d.removeEventListener("pointerleave", d._swordLeave); d._swordLeave = null; }
  d._swordLeave = rest;
  d.addEventListener("pointerleave", rest);

  screen._optRows = rows;
  const centers = ys.map((y) => y + list.h / 2);
  const wide = { left: SWORDS_WIDE.left, right: SWORDS_WIDE.right, top: SWORDS_WIDE.y };
  rows.forEach((r, di) => {
    const text = r.kind === "opt" ? screen.options[r.i].text : (r.kind === "more" ? "More options" : "Previous options");
    const top = di === 0 ? 0 : Math.round((centers[di - 1] + centers[di]) / 2);
    const bot = di === rows.length - 1 ? 96 : Math.round((centers[di] + centers[di + 1]) / 2);
    const hit = mk("div", "dlgOptHit");
    place(hit, 0, top, 480, bot - top);
    hit.dataset.option = String(di);
    d.appendChild(hit);
    const e = qtext(d, text, 0, ys[di], 480, list.h, C_LINE);
    e.dataset.option = String(di);
    e.style.pointerEvents = "auto";
    const enter = () => {
      e.style.color = hex(C_HOVER);
      if (roam) roamToRow(move, list, ys[di], text);
      else move(wide);
    };
    const leave = () => { e.style.color = hex(C_LINE); };
    hit.addEventListener("click", (ev) => { ev.stopPropagation(); pick(di); });
    e.addEventListener("click", (ev) => { ev.stopPropagation(); pick(di); });
    hit.addEventListener("pointerenter", enter);
    hit.addEventListener("pointerleave", leave);
    e.addEventListener("pointerenter", enter);
    e.addEventListener("pointerleave", leave);
  });
}

/* One roaming step: the swords hug the hovered line, a uniform ROAM_PAD past
   each end of its rendered width (quill8 at 15px, the same font the line is
   drawn in, so the frame is exact), centred on the row. Clamped to the bar's
   own wide slots, so a very long line holds the edges rather than spilling. */
const ROAM_PAD = 14;
const measureCtx = document.createElement("canvas").getContext("2d");
function roamToRow(move, list, rowY, text) {
  measureCtx.font = '15px "rs-quill8", monospace';
  const half = measureCtx.measureText(String(text)).width / 2;
  const top = rowY + Math.round((list.h - SWORD_SIZE.h) / 2);
  move({
    left: Math.min(421, Math.max(2, Math.round(240 - half - ROAM_PAD - SWORD_SIZE.w))),
    right: Math.min(421, Math.max(2, Math.round(240 + half + ROAM_PAD))),
    top,
  });
}

/* The title's own rest spot: the cache's narrow slots fit "Select an Option",
   so that title keeps them exactly, while a longer title (the dough question)
   hugs its own measured width the roaming way - clamped to the wide slots so an
   over-long title simply holds the box edges and clips at the dialogue region. */
function titleSwords(title) {
  if (!title || title === "Select an Option") return { left: SWORDS_NARROW.left, right: SWORDS_NARROW.right, top: SWORDS_NARROW.y };
  measureCtx.font = '15px "rs-quill8", monospace';
  const half = measureCtx.measureText(String(title)).width / 2;
  return {
    left: Math.min(421, Math.max(2, Math.round(240 - half - ROAM_PAD - SWORD_SIZE.w))),
    right: Math.min(421, Math.max(2, Math.round(240 + half + ROAM_PAD))),
    top: SWORDS_NARROW.y,
  };
}

/* --- the engine --------------------------------------------------------- */

let state = null;

export const Dialogue = {
  active: false,
  npc: null,
  /* the screen being shown, for tests */
  screen: null,
  queue: [],
};

function speakerName(who) {
  if (who === "player") return (UI.ps && UI.ps.name) || "You";
  return state && state.name ? state.name : "";
}

function computeHead(who) {
  if (!state || !state.npc) return { key: null, yaw: 0 };
  if (who === "player") return { key: playerHeadKey(), yaw: PLAYER_YAW };
  return state.key && typeof state.key === "object" ? state.key : { key: state.key, yaw: NPC_YAW };
}

function playerHeadKey() {
  /* The player's head is the head of the model their body is drawn from, so a
     `::skin` that puts them in a guard's body speaks through a guard's head.
     `ch.data.key` is the baked key the render object was built from (every
     character carries it), and the appearance is the fallback. */
  const p = Game.player;
  const key = p && p.ch && p.ch.data ? p.ch.data.key : null;
  if (key && headData.has(key)) return key;
  /* Headgear is worn, not baked: a hat, hood or helm shows in the box through
     the head the kit builds for the current appearance with that item's own
     worn model merged in (src/identikits.js#buildHeadgearHead) - head geometry
     only, never the body. Bare-headed players keep the kit head below. */
  const eq = UI.ps && UI.ps.equip;
  const headId = eq && eq.head && eq.head.id;
  if (headId && hasHeldModel(headId)) {
    const hatted = buildHeadgearHead(Game.playerAppearance, headId);
    if (hatted) return hatted;
  }
  /* A designed body is a merged kit, so it has no baked head of its own: its
     chat head is the head kit's own standalone head model, merged and painted
     with the player's own choices (src/identikits.js#buildKitHead). */
  const kitHead = buildKitHead(Game.playerAppearance);
  if (kitHead) return kitHead;
  return Game.playerAppearance === "female" ? "player_female" : "player_male";
}

/* Show one screen. The components are cleared first: every interface here is a
   fresh one in the client too (the server sends a whole new interface id), so
   nothing is ever drawn on top of the last screen. */
function showScreen(s) {
  /* A `then` closes the conversation before its function runs (see `then`), and
     it can be sitting anywhere in a queue, so it is handled as a screen with
     nothing on it rather than as a branch. */
  if (s && s.after) { const fn = s.after; endDialogue(); fn(); if (!Dialogue.active) showNextLevelUp(); return; }
  /* A screen's lines are a list of boxes; a tree may write a single line as a
     bare string, so it is wrapped here rather than at every call site (a string
     left as-is would be walked character by character and drawn one letter per
     line). */
  if (s && s.lines != null && !Array.isArray(s.lines)) s = Object.assign({}, s, { lines: [s.lines] });
  /* A lone choice is not a choice (see singleOptionScreen): it is spoken as
     the player's own reply, so an options box always offers at least two rows
     and an empty one never shows at all. A revisited options screen starts on
     its first page - only a More/Previous navigation re-shows the screen that
     is already up, and that path sets the page itself. */
  if (s && s.options && !s.lines) {
    if (!s.options.length) return conclude();
    if (s.options.length === 1) s = singleOptionScreen(s.options[0]);
    else if (s !== Dialogue.screen) s._optPage = 0;
  }
  const d = UI.els.chatDialog;
  if (!d) return;
  d.innerHTML = "";
  Dialogue.screen = s;
  if (s.onShow) s.onShow();

  if (s.options && !s.lines) {
    renderOptions(d, s, pageOptions(s));
  } else if (s.who === "levelup") {
    renderLevelUp(d, s);
  } else if (s.who === "statement") {
    renderStatement(d, s.lines || []);
  } else {
    const who = s.who || "npc";
    const box = who === "player" ? PLAYER_BOX : NPCS_BOX;
    const name = s.name != null ? s.name : speakerName(who);
    renderSpeech(d, box, name, s.lines || [], computeHead(who), s.expr);
    if (s.options && s.options.length === 1) Dialogue.queue.unshift(singleOptionScreen(s.options[0]));
    else if (s.options && s.options.length) Dialogue.queue.unshift({ options: s.options, title: s.title });
  }
  d.hidden = false;
  setChatDialogOpen(true);
}

/* "Click here to continue": the screen's own `next`, else the next screen in the
   queue, else the end. */
function advance() {
  const s = Dialogue.screen;
  if (!s) return conclude();
  if (s.next != null) return leave(s.next);
  if (Dialogue.queue.length) return showScreen(Dialogue.queue.shift());
  conclude();
}

/* An option was clicked - or a page turned. Display rows address the real option
   list through the screen's own `_optRows`, so More/Previous flip the page on
   the same screen while a real pick follows its `go` like before. */
function pick(i) {
  const s = Dialogue.screen;
  if (!s || !s._optRows || !s._optRows[i]) return;
  const r = s._optRows[i];
  if (r.kind === "opt") {
    const o = s.options && s.options[r.i];
    delete s._optPage;
    if (!o) return;
    return leave(o.go);
  }
  s._optPage = (s._optPage || 0) + (r.kind === "more" ? 1 : -1);
  showScreen(s);
}

/* Go wherever a `next`/`go` says: an array of screens to run, a function (which
   may return screens to branch to, or nothing at all to just do something - open
   a shop, hand over an item - and end the conversation), or "end". A function is
   also how a conversation loops back to itself, since a data literal cannot
   contain itself.

   A `then(fn)` is the same "do something" as a screen rather than as a branch, so
   it can close a list of screens: the box is torn down first and then the
   function runs, rather than the other way round, which is what a side effect
   that outlives the conversation needs - an NPC's yell across the courtyard, or
   a shop window opening on a clear screen. */
export function then(fn) {
  return { after: fn };
}

function leave(where) {
  if (where == null || where === "end") return conclude();
  if (typeof where === "function") {
    const out = where();
    if (out == null || out === "end") return conclude();
    return leave(out);
  }
  const list = Array.isArray(where) ? where : [where];
  if (!list.length) return conclude();
  Dialogue.queue = list.slice(1);
  showScreen(list[0]);
}

/* A level-up raised while the box is already showing something waits here
   rather than in `Dialogue.queue`. A conversation rewrites its own queue as it
   branches (`leave` replaces it outright) and empties it when it runs a `then`,
   so a level-up parked in that list could be dropped by the very next click -
   and a level-up dropped there is invisible, because the chat line that
   announces it is dropped too while a dialogue is up (`ui.js#chat`). Keeping
   them apart is what makes `showLevelUpInterface` safe to call at any moment. */
const levelUpQueue = [];

/* Show the next queued level-up. Called only with the box empty. */
function showNextLevelUp() {
  const screen = levelUpQueue.shift();
  if (!screen) return false;
  return startDialogue("levelup", [screen]);
}

/* The end of a conversation, everywhere a conversation can end. The teardown is
   `endDialogue`'s, and then - only if nothing the teardown ran opened a box of
   its own - a level-up that was waiting takes the box that just came free. */
function conclude() {
  endDialogue();
  if (Dialogue.active) return;
  showNextLevelUp();
}

export function endDialogue() {
  const d = UI.els.chatDialog;
  const was = Dialogue.active;
  Dialogue.active = false;
  Dialogue.screen = null;
  Dialogue.queue = [];
  /* The creature is free to wander off again the moment the box closes (see
     `startDialogue`'s `talking` flag). The Wise Old Man's post is the one
     exception to "free": he turns back to the new-player spawn tile ten ticks
     later (src/game.js#updateNpcs), so closing stamps the tick he comes back
     on - unless he is dead, in which case respawn owns him. */
  const who = Dialogue.npc;
  if (who) {
    who.talking = false;
    if (who.type === "wise_old_man" && !who.dead) who.turnHomeAt = Game.tickCount + 10;
  }
  Dialogue.npc = null;
  UI.chatDialogClick = null;
  UI.chatDialogClosed = null;
  if (d && !d.hidden) closeChatDialog();
  if (was && closeCb) { const fn = closeCb; closeCb = null; fn(); }
}

let closeCb = null;

/* Start a conversation. `npc` is the live creature (its type picks the head
   model and, unless a screen says otherwise, its display name). */
export function startDialogue(npc, screens, onClose) {
  if (!screens || !screens.length) return false;
  const type = typeof npc === "string" ? npc : npc.type;
  const live = typeof npc === "string" ? null : npc;
  /* A creature holds still and looks at whoever is speaking to it, for as long
     as the box is up - the client's own rule, and the reason an NPC never walks
     off mid-conversation. `talking` is read by `game.js#updateNpcs`, which is
     where every creature's wander lives; the flag is dropped again by
     `endDialogue`, so a creature is only ever still while a box is open. A
     conversation that replaces another must free the first speaker too. */
  if (Dialogue.npc && Dialogue.npc !== live) Dialogue.npc.talking = false;
  if (live) {
    live.talking = true;
    /* A new conversation cancels his turn back to the spawn tile: he is
       facing this speaker now, and the fresh close stamps a fresh timer. */
    live.turnHomeAt = 0;
    if (live.path) live.path.length = 0;
  }
  state = {
    npc: live,
    type,
    /* An archetype speaker goes by his own name and face - see archetypeHeadKey. */
    name: typeof npc === "string" ? "" : ((live && live.archetype && archetypeByKey(live.archetype)) ? archetypeByKey(live.archetype).name : npcDisplayName(type)),
    key: (live && live.archetype && archetypeByKey(live.archetype)) ? archetypeHeadKey(archetypeByKey(live.archetype)) : headKeyFor(type),
  };
  closeCb = onClose || null;
  Dialogue.active = true;
  Dialogue.npc = state.npc;
  Dialogue.queue = screens.slice(1);
  UI.chatDialogClick = onClick;
  UI.chatDialogClosed = () => conclude();
  showScreen(screens[0]);
  return true;
}

/* The chatbox click: an option's own handler has already stopped the bubble by
   the time this runs, so anything that gets here is "advance". */
function onClick(e) {
  if (!Dialogue.active) return false;
  if (e && e.target && e.target.dataset && e.target.dataset.option != null) return false;
  advance();
  return true;
}

window.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return;
  const t = document.activeElement;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (!Dialogue.active || !UI.els.chatDialog || UI.els.chatDialog.hidden) return;
  const k = e.key;
  if (k === " " || k === "x" || k === "X" || k === "e" || k === "E") {
    const s = Dialogue.screen;
    if (s && s.options && !s.lines) return;
    e.preventDefault();
    advance();
    return;
  }
  if (k >= "1" && k <= "5") {
    const s = Dialogue.screen;
    if (!s || !s._optRows) return;
    const i = +k - 1;
    if (i < s._optRows.length) { e.preventDefault(); pick(i); }
  }
});

/* ------------------------------------------------------ the level-up panel

   The one entry point, handed to ui.js through `UI` rather than imported:
   this module reads the ui kit at its own top level, so ui.js importing this
   file back would be a cycle (the same reason ui.js hands *its* actions over as
   `UI.actions`). A level-up screen is an ordinary dialogue screen of its own
   kind, so the queue, the chatbox click and the teardown are all shared. */
export function showLevelUpInterface(skill, level) {
  if (!levelupScreen(skill, level)) return false;
  const screen = { who: "levelup", skill, level };
  /* An open conversation is never torn down for it: the level-up waits and
     shows the moment the box comes free. */
  if (Dialogue.active) { levelUpQueue.push(screen); return true; }
  return startDialogue("levelup", [screen]);
}

UI.showLevelUpInterface = showLevelUpInterface;

/* Take a level-up panel off the chatbox without the player having to click it
   away. The client's level-up is an ordinary interface, not a conversation: it
   is overwritten by the next thing the player does rather than being something
   they must answer. So every action in the game - a click on the world, an
   attack, a skilling cycle, a spell, an emote, a menu row - calls this first
   (through `UI.dismissLevelUp`, which every module already holds), and a panel
   that happens to be up is simply gone by the time the action's own messages
   are written. Nothing is lost: the chat line that announced the level was
   written when it happened and is not part of the panel.

   A *queued* level-up goes with it. Several levels can be raised by one flurry
   of XP (a hit that finishes a creature levels Hitpoints and Attack together,
   say), and re-opening a box the player has already moved on from, one at a
   time, long after the fight, is not what "interrupted" can mean.

   Returns whether a panel was actually on screen, which is what the world click
   uses to know the click was spent clearing it. That is *not* the case here -
   the click goes on to do its own thing as well, exactly as the client's does;
   the return value is only there for a caller that wants it. */
export function dismissLevelUp() {
  const up = !!Dialogue.screen && Dialogue.screen.who === "levelup";
  levelUpQueue.length = 0;
  if (!up) return false;
  endDialogue();
  return true;
}

UI.dismissLevelUp = dismissLevelUp;

/* ------------------------------------------------------- the head models */

function headKeyFor(type) {
  const k = npcModelKey(type);
  if (k && headData.has(k)) return { key: k, yaw: NPC_YAW };
  if (k) {
    const fb = ensureFallbackHead(k);
    if (fb) {
      const e = headData.get(fb);
      return { key: fb, yaw: e && e.headFlip ? (NPC_YAW + 1024) % 2048 : NPC_YAW };
    }
  }
  return { key: null, yaw: NPC_YAW };
}

/* An archetype speaker's head: an archetype with its own baked chathead
   (`chathead`, a key of src/models/heads.json) speaks through that head - the
   Bee keeper's veiled head, posed on his own idle - while every other
   archetype speaks through the head kit's own standalone head model, merged
   and painted with the archetype's own choices - the same standalone head a
   designed player body speaks through (see playerHeadKey above). */
function archetypeHeadKey(arch) {
  if (arch.chathead && headData.has(arch.chathead)) return { key: arch.chathead, yaw: NPC_YAW };
  const kitHead = buildKitHead(archetypeAppearance(arch));
  if (kitHead) return { key: kitHead, yaw: NPC_YAW };
  return headKeyFor(arch.base);
}

const headMeshes = new Map();

/* The head's own static mesh (src/models3d.js#makeStaticMesh). Built once per
   character key and shared by every speaker drawn from it. */
function headMesh(key) {
  if (!key) return null;
  let m = headMeshes.get(key);
  if (m === undefined) {
    m = makeStaticMesh(key);
    headMeshes.set(key, m);
  }
  return m;
}

function npcDisplayName(type) {
  if (NPC_NAMES[type]) return NPC_NAMES[type];
  return type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/* --------------------------------------------------------------- the trees

   One conversation per NPC type. The keys are the spawn types src/world.js
   places; a type with no tree falls back to the one-line greeting in
   src/actions.js#NPC_LINES, so adding a person to the world and adding their
   conversation are separate steps. Each tree is written in the voice its own
   NPC page gives it - see src/README.md, "The town's conversations". */

export const NPC_TALK = {};

/* --- writing a tree ------------------------------------------------------

   Three shorthands, because a tree is mostly boxes: `npc(lines)`, `player(lines)`
   and `say(lines)` (a statement box, for narration). `lines` is a string or an
   array of them - the client breaks a box at its own `|` (see the rs2 scripts),
   so an array is a box whose lines are already split - and an extra object
   merges in on top, which is how a screen carries options or a `next`. `opt` is
   one row of an option list.

   The lines themselves are transcriptions. Where a conversation is the live
   game's own, the comment above it names the script it came out of (LostCityRS's
   `Content` repo, which is the decompiled OSRS content of the same era); where
   the live game never wrote one - the Lumbridge Guide has no page of its own -
   it says so, and the words are this world's own. */
/* The conversation vocabulary. These four are exported because a conversation
   that has to *do* things (open a shop, count wool, pay a quest out) is written
   in the module that owns the doing - src/actions.js#bobScreens and
   #fredScreens - and its trees read the same way the ones here do. */
export const npc = (lines, extra) => Object.assign({ lines: [].concat(lines) }, extra || {});
export const player = (lines, extra) => Object.assign({ who: "player", lines: [].concat(lines) }, extra || {});
export const say = (lines, extra) => Object.assign({ who: "statement", lines: [].concat(lines) }, extra || {});
export const opt = (text, go) => ({ text, go });

/* The monk's heal, which is the client's own `stat_heal(hitpoints, 2, 20)`: two
   hitpoints plus a fifth of the level. It runs as the box closes (see `then`) so
   the message lands in the chat log rather than underneath the box that is
   being taken down. The laying-on of hands plays with it: the monk performs
   the content's own heal cast (baked as `heal` on his model - seq 709,
   `human_castheal`) and the heal sparkle settles on the healed body
   (spotanim 84, `heal_casting`, at the script's own height 120). */
let healMonk = null;

/* Scully's thirst pitch: the branch both greeting options lead to. A function
   because two option lists share it (the greeting's "What do I do now?" and
   the "Who are you?" tail), and a tree literal cannot name itself. */
function scullyThirst() {
  return [
    player("What do I do now?"),
    npc(["You are thirsty. The sea air has not told you yet.",
      "Thirst arrives before hunger.",
      "It stays after hope."]),
    npc(["Up in those crowns: coconuts.",
      "Water in locked boxes.",
      "The crabs guard them. The crabs guard everything."], {
      options: [
        opt("How do I reach them?", () => scullyHow()),
        opt("Shouldn't I eat first?", [
          player("Shouldn't I eat first?"),
          npc(["The hungry can think, pupil.",
            "The thirsty can only swallow.",
            "Water first. The water is up a tree -"]),
          npc(["which is why we begin with rope,",
            "and not with lunch."]),
        ]),
      ],
    }),
  ];
}

/* The rope quest (tutorial stage 1): rigging off the cay wreck, then bending.
   Ends with `then` so the stage flag lands after the box closes. */
function scullyHow() {
  return [
    player("They're far above me. How do I reach them?"),
    npc(["With rope. Sailors reach everything with rope.",
      "Your wreck wears her rigging still.",
      "East along the beach. Strip her."]),
    npc(["Bring me a good length of it.",
      "Then: bending. The persuasion of trees.",
      "One lesson at a time. I grade them all."], {
      next: then(tutRopeQuest),
    }),
  ];
}

/* Scully's crab bit (tutorial greeting beats 5-7): pure staging, no words of
   its own. Beat 5 turns him off the player-tracking for the rest of the
   greeting (his spawn radius is 0, so he stands, he never wanders off) and
   fires a jab at the nearest crab; beat 7 sends that crab scuttling away
   from him. The closing options screen re-latches the player-tracking. */
function scullyNearestCrab() {
  try {
    const sk = Dialogue.npc;
    if (!sk) return null;
    let best = null, bd = 1e9;
    for (const n of (Game.npcs || [])) {
      if (!n || n.type !== "crab" || n.dead) continue;
      const d = (n.x - sk.x) * (n.x - sk.x) + (n.z - sk.z) * (n.z - sk.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  } catch (e) { return null; }
}

function scullyPointCrab() {
  try {
    const sk = Dialogue.npc;
    if (!sk) return;
    const crab = scullyNearestCrab();
    if (crab) sk.dir = Math.atan2(crab.x - sk.x, crab.z - sk.z);
    sk.talking = false;
    sk.attackAnim = 1;
  } catch (e) {}
}

function scullyScuttleCrab() {
  try {
    const sk = Dialogue.npc;
    if (!sk || !Game.world) return;
    const crab = scullyNearestCrab();
    if (!crab) return;
    const dx = crab.x - sk.x, dz = crab.z - sk.z;
    const len = Math.hypot(dx, dz) || 1;
    for (const dist of [3, 2, 4]) {
      const tx = Math.floor(crab.x + (dx / len) * dist), tz = Math.floor(crab.z + (dz / len) * dist);
      try { if (walkTo(crab, Game.world, tx, tz, 0, NO_MODS)) return; } catch (e) {}
    }
  } catch (e) {}
}

/* The rope quest flag (tutorial stage 1): set when Scully sends the pupil
   after rigging. The save carries it through player.js, so this module never
   imports actions.js for it. */
function tutRopeQuest() {
  try {
    const ps = window.Game && window.Game.ps;
    if (ps) setTutStage(ps, 1);
  } catch (e) {}
}
function monkHeal() {
  const ps = UI.ps;
  const monk = healMonk;
  healMonk = null;
  if (monk && !monk.dead && Game.player && !Game.player.dead) {
    try { monk.dir = Math.atan2(Game.player.x - monk.x, Game.player.z - monk.z); } catch (e) {}
    playCastAnim(monk, "heal");
    Gfx.play(84, { x: Game.player.x, z: Game.player.z, height: 120, target: Game.player });
  }
  if (!ps || ps.hp == null) return;
  const healed = Math.min(ps.maxHp - ps.hp, 2 + Math.round(ps.maxHp * 0.2));
  if (healed <= 0) return;
  ps.hp += healed;
  chat("You feel a little better.", "game");
}

/* Once the trees are written, the keys are the spawn types src/world.js places
   (a type with no tree falls back to NPC_LINES, one line per click, through the
   same box - see linesAsScreens below). Writing them as an assignment rather
   than an object literal is what lets a tree refer to itself (Hans greets you
   again if you ask him something twice) and lets one tree's branch be a
   function, which is how a conversation does something as well as say it. */
Object.assign(NPC_TALK, {

  /* Hans, the Duke's servant: the first conversation a 2007 player had, and the
     one that teaches the pattern - a greeting, three ways to answer it, and an
     answer to each. `~chatnpc` is a whole box, and the two-line version below
     is `|`-split. Option 2's yell is `npc_say` after an `if_close`; the box is
     gone by the time he shouts, which is what `then` gives us. */
  hans: [
    npc("Hello. What are you doing here?", {
      expr: "neutral",
      options: [
        opt("I'm looking for whoever is in charge of this place.", [
          player("I'm looking for whoever is in charge of this place.", { expr: "neutral" }),
          npc("Who, the Duke? He's in his study, on the first floor.", { expr: "neutral" }),
        ]),
        opt("I have come to kill everyone in this castle!", () => {
          const who = Dialogue.npc;
          return [
            player("I have come to kill everyone in this castle!", { expr: "angry" }),
            then(() => sayOverhead(who, "Help! Help!")),
          ];
        }),
        opt("I don't know. I'm lost. Where am I?", [
          player("I don't know. I'm lost. Where am I?", { expr: "confused" }),
          npc("You are in Lumbridge Castle.", { expr: "neutral" }),
        ]),
      ],
    }),
  ],

  /* The Bee keeper in the smithy: the user's own words - he stands, and he
     would rather not walk. One option, one answer, and the box closes. */
  beekeeper: [
    npc("Me? I'm just standing here.", {
      options: [
        opt("Fancy going for a walk?", [
          player("Fancy going for a walk?"),
          npc("I'd rather not."),
        ]),
      ],
    }),
  ],

  /* Scully, the tutorial island's mad recruiter (src/world.js): a skeleton in
     a pirate hat, two hundred and forty years beached, recruiting crabs - and
     pupils - for a dead god this world has never heard of. Comic relief with
     anvil-sized hints only (dead words, a flinch at the bright shepherd,
     suspiciously specific nonsense); the quest content keeps the reveal. His
     first words are still his marks for the rescue, and the beginning is still
     rope and coconuts, not the axe. */
  scully: [
    npc("OW. That is MY hat.", {
      expr: "angry",
      next: [
        player(["Sorry - I only wanted the hat.", "Wait... YOU CAN TALK??"]),
        npc(["Arrr, cours'a kin talk.",
          "Cap'n Scully, not talk?",
          "Me ship would run aground, matey."], { expr: "angry" }),
        npc(["M'crew need thur oer'd'urves.",
          "I mean... thur orders."], { expr: "neutral" }),
        say("(He seems to have lost his mind.)"),
        say("Cap'n Scully points at a crab nearby on the beach.", { onShow: scullyPointCrab }),
        npc(["Oi! You thur -- fetch me me oer'd'urves.",
          "That's'an order!"], { expr: "angry" }),
        say(["The crab blinks up at Cap'n Scully,",
          "then scuttles away."], { onShow: scullyScuttleCrab }),
        {
          options: [
            opt("Who are you?", [
              player("Who are you?"),
              npc(["Captain once. Crew once. Cargo once.",
                "Two hundred forty years of sand in my boots.",
                "Now: crabs."]),
              npc(["The sea took my ship. The desert took my skin.",
                "Something worse took my death and kept it.",
                "Ask the sand. It remembers me wrong."]),
              npc(["I could lift those nuts with a thought, once.",
                "The thoughts leak now. They drip out.",
                "The crabs understand. Nobody else understands."]),
              npc(["ZAROS. Say it with your whole chest.",
                "Dead, they say. They are wrong about dead.",
                "Look at me. Exhibit A."]),
              npc(["ZAROS. Say it with your whole chest.",
                "Dead, they say. They are wrong about dead.",
                "Look at me. Exhibit A."]),
            ]),
            opt("What do I do now?", () => scullyThirst()),
          ],
          onShow() { try { if (Dialogue.npc) Dialogue.npc.talking = true; } catch (e) {} },
        },
      ],
    }),
  ],

  hiatus: [
    npc(["Three clue scrolls, friend. Three.", "Most folk open hundreds. Buttons. Beige.", "I got third age. Built different."], { expr: "happy" }),
    npc(["Hate us 'cause they ain't us, they say.", "...Do you ever wonder if they're right?", "I do. Evenings. Seven to... seven."], { expr: "sad" }),
    npc(["Anyway. Don't touch the pile."], { expr: "angry" }),
    npc(["Someone has to sit with the gold.", "Hours I sit. Days, even.", "You start to wonder who keeps whom."], { expr: "bored" }),
    npc(["Crassus gets it. Sits here all day.", "Wants nothing from it. Stupid animal.", "Perfect animal. ...What were we- Right. Me."], { expr: "happy" }),
  ],

  /* The monk of the Lumbridge church (the monastery monk's own script). The heal
     is real: `~stat_heal(hitpoints, 2, 20)` is two points plus a fifth of your
     level, and the content plays its own cast with it - `npc_anim(human_castheal)`
     on the monk, `spotanim_pl(heal_casting)` on the healed body (see monkHeal). */
  monk: [
    npc("Greetings traveller.", {
      options: [
        opt("Can you heal me? I'm injured.", [
          player("Can you heal me? I'm injured."),
          npc("Ok.", { next: then(monkHeal), onShow() { healMonk = Dialogue.npc; } }),
        ]),
        opt("Isn't this place built a bit out the way?", [
          player("Isn't this place built a bit out the way?"),
          npc("We are a silent order. The quiet suits us, and the walk does the pilgrims good."),
        ]),
        opt("Who are you?", [
          player("Who are you?"),
          npc("We are monks of Saradomin. Our order has kept this church for longer than the town has stood."),
        ]),
      ],
    }),
  ],

  /* Father Aereck, the parish priest (the church of holy Saradomin script, the
     default branch - the quest branch is left out because this world has no
     ghost quest to start). The Saradomin explanation is his, word for word. */
  priest: [
    npc("Welcome to the church of holy Saradomin.", {
      options: [
        opt("Who's Saradomin?", [
          player("Who's Saradomin?"),
          npc("Surely you have heard of the god, Saradomin?"),
          npc(["He who creates the forces of goodness and purity in this world?", "I cannot believe your ignorance!"]),
          npc(["This is the God with more followers than any other!", "At least in this part of the world."]),
          npc("He who created this world along with his brothers Guthix and Zamorak?", {
            options: [
              opt("Oh, THAT Saradomin...", [
                player("Oh, THAT Saradomin..."),
                npc("There... is only one Saradomin..."),
              ]),
              opt("Oh, sorry. I'm not from this world.", [
                player("Oh, sorry. I'm not from this world."),
                npc("..."),
                npc("That's... strange."),
                npc("I thought things not from this world were all slime and tenticles."),
              ]),
            ],
          }),
        ]),
        opt("Nice place you've got here.", [
          player("Nice place you've got here."),
          npc(["It is, isn't it?", "It was built over 230 years ago."]),
        ]),
        opt("Bless me, father.", [
          player("Bless me, father."),
          npc("May Saradomin watch over you, my child. You will find the monks in the castle keep the chapel - and they will mend your wounds for the asking."),
        ]),
      ],
    }),
  ],

  /* The cook, in the voice his post-quest script gives him: four things a player
     actually wanted to say to him, and his answer to each. The hat line is the
     most important one. */
  cook: [
    npc("How is the adventuring going, my friend?", {
      options: [
        opt("I am getting strong and mighty.", [
          player("I am getting strong and mighty."),
          npc("Glad to hear it."),
        ]),
        opt("I keep on dying.", [
          player("I keep on dying."),
          npc("Ah well, at least you keep coming back to life!"),
        ]),
        opt("Nice hat!", [
          player("Nice hat!"),
          npc("Err thank you. It's a pretty ordinary cooks hat really."),
        ]),
        opt("Can I use your range?", [
          player("Can I use your range?"),
          npc(["Go ahead - it's a very good range.", "It's easier to use than most other ranges."]),
        ]),
      ],
    }),
  ],

  /* The town's children. The live game gives its Ardougne children exactly one
     line, and it is the right one: a child has nothing to say to a stranger.
     Our own child and schoolgirl (src/actions.js#NPC_LINES) keep their own
     voices, so this is deliberately not applied to them. */

  /* The Lumbridge Guide. He has no page in the live game's content - the guide
     predates the script system's coverage, or was never given one - so his words
     are this world's own, written as the one NPC whose whole job is to tell a
     new player what the town and the world are for. */
  lumbridge_guide: [
    npc("Greetings, adventurer! I am the Lumbridge Guide.", {
      options: [
        opt("Where am I?", [
          player("Where am I?"),
          npc("You are standing in Lumbridge, the town where most adventurers begin."),
          npc(["To the north is the castle, and the Duke's servants within it.", "To the south the river runs out to the sea, and the church stands to the east."]),
        ]),
        opt("What should I do first?", [
          player("What should I do first?"),
          npc("Try your hand at a skill! There is a woodcutting grove west of the castle, a mine in the hills, and fishing spots along the river."),
          npc(["Everything you gather, you can sell at the shops in the square.", "And when you are ready for a fight, the goblins south of the river are a fine place to start."]),
        ]),
        opt("How do I get stronger?", [
          player("How do I get stronger?"),
          npc(["Your combat skills rise as you use them - attack, strength, defence and hitpoints.", "Wear the best armour you can afford, and carry food."]),
          npc("The churchyard and the crypt beneath are a step up from the fields, so keep some bread about you."),
        ]),
        opt("What is there to buy around here?", [
          player("What is there to buy around here?"),
          npc(["The general store, the armourers and the sword shop all keep a counter in the square.", "The food store, the fishing shop and the archery emporium are close by, and an apothecary sells herbs."]),
        ]),
      ],
    }),
  ],

  /* The drunken man keeps his own lines (src/actions.js#NPC_LINES): the live
     game's own pub drunks have a dozen stock phrases and no conversation, and
     that is what he is for. */

  /* The Wise Old Man's tutorial post by the town square (src/world.js): the
     first face a new spawn sees. A character fresh out of the maker does not
     have to walk up to him - he speaks first (actions.js#greetNewArrival,
     from main.js#enterWorld): his own tree opens in the chatbox a breath
     after the world appears. His words are the town's own original
     welcome, kept flowing the way people actually talk - a long line gets its
     own screen rather than sharing one, so no box ever runs past three lines.
     He names the town Discord, puzzles over the founders' statue (which talks
     through a cloud, or something - see src/actions.js#readPlaque), and tells
     newcomers plainly that GameMaker is still building the engine. Every
     branch leads back to the player's own option list - never the greeting,
     and never closed - which is why the list is built first and each option
     is a function returning to it (a data literal cannot contain itself). The skillcape vendor across town is a different
     man - Mac, with his own shop (src/actions.js#interactNpc serves a spawn's
     shop before its tree) - so this tree only ever speaks here. */
  wise_old_man: (() => {
    /* Every branch ends on the player's own option list - never back on the
       greeting, and never closed. */
    const options = [
      opt("I'm new here. How does all this work?", () => [
        player("I'm new here. How does all this work?"),
        npc("Left-click the ground to walk, and left-click people to talk to them."),
        npc("Right-click anything for more choices, and drag with the right button to look around."),
        npc("And use the wheel to zoom."),
        { options },
      ]),
      opt("What's that statue over there?", () => [
        player("What's that statue over there?"),
        npc("That? A monument to the town's founders, or so the plaque claims."),
        npc("They say it lets you talk to folk through a cloud, or something. I never got the hang of it."),
        { options },
      ]),
      opt("What's going on around here?", () => [
        player("What's going on around here?"),
        npc("GameMaker is still building the engine, so mind the scaffolding."),
        npc("Bits of the town are still going up. If it looks unfinished, it is."),
        { options },
      ]),
      opt("How do I get stronger?", () => [
        player("How do I get stronger?"),
        npc("Fight, and your combat skills will rise with every blow."),
        npc("Wear the best armour you can afford - the shops in this square will kit you out."),
        npc("They'll take your money with a smile, too."),
        npc("Oh, and use the bank. You'll thank me one day."),
        { options },
      ]),
    ];
    return [npc("Ah, a new face! Welcome to Discord, young adventurer.", { options })];
  })(),

  /* The barbarian (unit W). His standard dialogue is six stock lines, of which
     one is picked at random, and the sixth is answered with a fight rather than
     with words - "The barbarian attacks the player" ends the branch
     (Transcript:Barbarian, the `barbarian_standard` script of the era). That is
     exactly why he needs a tree and not an NPC_LINES row: the sixth line has to
     *do* something, and a one-line greeting cannot. Transcribed verbatim,
     "ja?" and all. He is not aggressive of his own accord here
     (`src/combat.js#AGGRO` has no row for him), so the only way to start this
     fight is to talk to him - which is the live game's behaviour too. */
  barbarian: (who) => {
    const lines = ["Wanna fight?", "Ah, you come for fight, ja?", "You look funny.", "Grrr!", "What you want?"];
    if (Math.random() < 1 / 6) {
      return [
        npc("Go away!"),
        then(() => { if (who && !who.dead) who.target = Game.player; }),
      ];
    }
    return [npc(lines[(Math.random() * lines.length) | 0])];
  },
});

/* A one-screen conversation built from the fallback lines, so a person with no
   tree written yet still talks through the real dialogue box rather than a
   chat line. A fallback line is one string with no row breaks of its own, and
   some of them run longer than the head boxes' 350px text column (Duke
   Horacio's did, spilling out of the box) - so the picked line is greedily
   word-wrapped to the column, measured in the dialogue font itself, and capped
   at the head boxes' four rows. Hand-written trees need none of this: their
   authors split the rows themselves. */
let _dlgMeasure = null;
function dlgTextW(str) {
  if (!_dlgMeasure) {
    _dlgMeasure = document.createElement("canvas").getContext("2d");
    _dlgMeasure.font = '15px "rs-quill8", monospace';
  }
  return Math.ceil(_dlgMeasure.measureText(str).width);
}
function wrapDlgLine(str, maxW, maxRows) {
  const rows = [];
  const push = (s) => { if (rows.length < maxRows) rows.push(s); };
  let line = "";
  for (const raw of String(str).split(" ")) {
    let word = raw;
    while (word && dlgTextW(word) > maxW) {
      let k = word.length - 1;
      while (k > 1 && dlgTextW(word.slice(0, k)) > maxW) k--;
      push(word.slice(0, k));
      word = word.slice(k);
      if (rows.length >= maxRows) return rows;
    }
    if (!word) continue;
    const t = line ? line + " " + word : word;
    if (dlgTextW(t) <= maxW) line = t;
    else {
      push(line);
      if (rows.length >= maxRows) return rows;
      line = word;
    }
  }
  if (line) push(line);
  return rows;
}
export function linesAsScreens(npc, lines) {
  const picked = lines[(Math.random() * lines.length) | 0];
  const s = { who: "npc", name: npcDisplayName(npc.type), lines: wrapDlgLine(picked, NPCS_BOX.textW, 4) };
  if (npc.type === "duke") s.expr = "angry";
  return [s];
}
