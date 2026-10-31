/* ===========================================================================
   dollstage.js — where the character stands on the design and name screens.

   Both of those screens are the same cache interface (269): one riveted iron
   window with a model widget in the middle and the Accept plate across the
   widget's lower pixels, and both show the player's own character in it, swaying
   on the same clock. The only thing they disagree about is where the figure
   goes, because the name step draws a label, an entry field and a status line
   across the window above the widget's box.

   So the arithmetic lives here, once, and both screens ask for a "stage" - the
   canvas box to place and the framing to draw with.

   ## The one number this rests on

   A body's authored box (src/models3d.js#buildMesh) *is* its visible height -
   measured off the rendered canvas rather than reasoned about: a 1.578-unit body
   draws 364 pixels into a 400-pixel canvas, i.e. 1.578 units to the pixel. So
   `drawStage` asks `View.drawDoll` for a *span* - the model units the canvas is
   to show - rather than for a `fit`, and the figure comes out exactly `figureH`
   pixels tall in any canvas. (`fit` alone will not do it: it leaves the camera
   to the larger of the height and width constraints, and a 136-wide canvas is
   narrow enough for the width to take over and draw the body 12% too big.)

   The box is a hair taller than the figure, though - the same sliver of air
   above the head that the feet spend below - so a figure framed by its box sits
   a few pixels low. `DOLL_SINK` (src/scene.js) is that difference, in model
   units, measured the same way (13.5 pixels at 230 pixels to the unit for the
   male body, 12 for the female).

   And the box is only the *start* of the framing, because the doll camera is a
   perspective one: what comes out of the render is a few per cent taller than
   the sum says and a pixel or two off its centre, which on a screen whose whole
   job is to show the player their own character is visible. `drawStage`
   therefore measures the first drawing it gets (the bounds `View.drawDoll` hands
   back) and corrects both the span and the centre line from it, keeping the
   answer for the frames that follow - so the figure is `figureH` pixels tall
   with its centre on the stage's own centre to the pixel, whatever the lens
   does.

   ## What the reference says

   The cache's own design screen (interface 269, component 98) declares the box
   the model is drawn in: 136x168 at (190, 155). That is the figure's size, and
   it is what the body is given on both screens rather than a number picked by
   eye.

   Where it stands is the one thing the two screens disagree about, because the
   name step writes its label, field and status line across the upper half of the
   same window. So each screen hands the figure the *free space it has left* -
   from the foot of whatever text crosses the widget's own columns (on the
   design screen, a line of the title, y 49) down to the top edge of the Accept
   plate at y 266 - and the figure stands centred in that band, never taller than
   the cache's widget height. On the design screen the band is taller than the
   widget, so the figure is the widget's own 168 pixels, centred with 25 pixels
   of air under its feet; on the name screen the band is only 119 tall (the
   screen's own label, field and status line are above it), so the figure is the
   band less its own air, 99 pixels.
   =========================================================================== */

import { DOLL_SINK } from "./scene.js";

/* Air left inside the stage canvas: the figure fills 1/1.3 of it, so the body has
   room around it (and so a limb that reaches past it is still drawn). */
export const FIGURE_MARGIN = 1.3;

/* The doll camera is a 42-degree lens close to the body, near enough that the
   parts nearest it - the chest, the shoulders, the beard - project a little
   larger than a flat figure would, so the drawn body comes out taller than the
   model units asked for. This is the starting guess for that (a body drawn into
   a canvas asked to show it 90 pixels tall measured 105, i.e. about this much
   over), used for the first paint of a stage; `drawStage` then measures the
   drawing it got and corrects the framing to the pixel, so this number only has
   to be in the right region, and the framing never depends on it staying
   accurate. */
export const FIGURE_PERSPECTIVE = 1.1;

/** The cache's model widget - the component the figure is drawn in. */
export function modelWidget(data) {
  return data.parts.find((p) => p.type === 6) || null;
}

/** The Accept plate of a baked screen: the filled component carrying `action`. */
export function acceptPlate(data, action) {
  return data.parts.find((p) => p.action === action && p.type === 3) || null;
}

/* The canvas box and framing for a figure `height` pixels tall whose own centre
   belongs on `centreY` (both in the interface's own pixels). The canvas is grown
   by the margin so the body has air around it; `figureH` is the height the
   *drawn* figure is to be, which `drawStage` measures the drawing against and
   corrects to (hence `cal`, the correction it learns on the first paint). */
function stageBox(widget, { height, centreY, margin = FIGURE_MARGIN }) {
  const h = Math.round(height * margin);
  return {
    x: widget.x,
    y: Math.round(centreY - h / 2),
    w: widget.w,
    h,
    figureH: height,
    centreY,
    sink: DOLL_SINK,
    cal: null,
  };
}

/* How much air the figure keeps inside its band, top and bottom: the body's own
   box is a sliver taller than the body, and a figure touching the plate below it
   or the text above it reads as a mistake rather than as a frame. */
const FIGURE_AIR = 10;

/* The foot of the free space a screen's figure stands in: the bottom of the
   lowest text component that crosses the model widget's own columns. On the
   cache's design screen that is a line of the title (y 49) - the option lists
   are *beside* the widget, not above it, so they do not shorten the band, and
   the Accept plate's label is below the widget's top and so is no part of this
   (it is the band's own floor). */
function airTop(data, widget) {
  let top = 0;
  for (const p of data.parts) {
    if (!p.text || !p.text.trim()) continue;
    if (p.x + p.w <= widget.x || p.x >= widget.x + widget.w) continue;
    if (p.y >= widget.y) continue;
    top = Math.max(top, p.y + p.h);
  }
  return top;
}

/* The figure's height and centre line in the band from `top` to `foot`: centred
   in it, less the air above and below, and never taller than the cache's own
   model widget (which is what fixes the size on the design screen, where the
   band is taller than the widget). */
function figureIn(widget, top, foot) {
  const height = Math.max(40, Math.min(widget.h, foot - top - FIGURE_AIR * 2));
  return { height, centreY: (top + foot) / 2 };
}

/* The character-design screen's stage: the cache's own widget height, standing
   centred in the window's free space - below the title, above the Accept plate. */
export function designStage(data, acceptAction) {
  const widget = modelWidget(data);
  if (!widget) return null;
  const plate = acceptPlate(data, acceptAction);
  const foot = plate ? plate.y : widget.y + widget.h;
  return stageBox(widget, figureIn(widget, airTop(data, widget), foot));
}

/* The name step's stage: the same window and the same rule, but this screen's
   own label, entry field and status line are the text above the figure, and the
   cache's parts know nothing about them - so the caller hands their foot in
   (`top`, src/charname.js#FIGURE_TOP) and the band below it is what is left. */
export function nameStage(data, acceptAction, top) {
  const widget = modelWidget(data);
  if (!widget) return null;
  const plate = acceptPlate(data, acceptAction);
  const foot = plate ? plate.y : widget.y + widget.h;
  return stageBox(widget, figureIn(widget, top, foot));
}

/* Paint a preview into a stage. Both screens' per-frame paint is this one call,
   so a change to the framing can never reach one of them and miss the other.

   The canvas is asked to show exactly as many model units as put the body's own
   height on `figureH` pixels: the body's authored height is the figure (measured
   off the rendered canvas - a 1.578-unit body draws 364 pixels in a 400-pixel
   canvas, i.e. its own height to the pixel), and the stage's own centre line is
   where the *figure's* centre goes.

   ## Why the first paint is measured rather than trusted

   The projection is a perspective one, so the arithmetic above is a little off
   in practice: the parts of the body nearer the lens draw larger than the flat
   figure the sum assumes, and the drawn body comes out both taller than
   `figureH` and a few pixels off the centre line - which is exactly what a
   screen showing the character for the player to look at cannot afford, because
   the eye reads a figure that is not centred as a bug.

   So the paint is measured and corrected: `View.drawDoll` hands back the box the
   drawing came out at, and the framing is adjusted from it - the span scaled so
   the drawn height is `figureH`, and the camera's centre moved by the pixel
   error so the drawn centre lands on the stage's own. Both are linear in the
   error, so one measured pass has the answer and the next confirms it. The
   answer is kept on the stage (`stage.cal`) and later frames draw with it -
   which is why they cost one pass and not four: a frame painted with a
   correction that still fits measures as converged and stops there.

   Keeping the measurement in every paint (rather than trusting the stored
   answer) is what makes the stage self-healing: the first paint of a stage can
   land before the render loop has posted the mesh's first pose, and a garbled
   drawing then leaves a garbled correction behind - which the next frame's own
   measurement is free to correct. The correction is keyed to the body and the
   canvas box it was measured in, so the other sex's body, or a stage of another
   size, measures itself rather than reusing a number that was never about it. */
export function drawStage(view, mesh, canvas, stage, yaw, pitch) {
  if (!stage || !canvas || !mesh) return;
  const measure = mesh.userData && mesh.userData.measure;
  const hgt = (measure && measure.hgt) || 1.578;
  const key = hgt + "/" + ((measure && measure.wid) || 0) + "/" + canvas.width + "x" + canvas.height;
  const known = stage.cal && stage.cal.key === key ? stage.cal : null;
  let k = known ? known.k : 1;
  let d = known ? known.d : 0;

  /* the body's centre belongs on this canvas row (interface y -> canvas y) */
  const targetY = stage.centreY - stage.y;
  const nominal = (canvas.height * hgt) / stage.figureH / FIGURE_PERSPECTIVE;
  /* a drawn height is a whole number of pixels, and the sway moves it between
     two of them, so a pixel either way is as converged as this can get */
  const eps = 1;

  for (let pass = 0; pass < 4; pass++) {
    const span = nominal * k;
    const box = view.drawDoll(mesh, canvas, yaw, pitch, 0.55, stage.sink + d, span);
    /* nothing was drawn (an unskinned mesh this frame, say): there is nothing to
       measure either, and the next frame will be here in a moment */
    if (!box || box.bot < box.top) return;
    const drawn = box.bot - box.top + 1;
    const mid = (box.top + box.bot) / 2;
    if (Math.abs(drawn - stage.figureH) <= eps && Math.abs(mid - targetY) <= eps) {
      stage.cal = { key, k, d };
      return;
    }
    /* the drawn height is inversely proportional to the span, so this drawing
       says what to scale the span by; and a pixel of error is `span / canvasH`
       model units at the body's plane, which is how far to lift the camera's own
       centre line to move the figure up a pixel */
    k *= drawn / stage.figureH;
    d += (mid - targetY) * (span / canvas.height);
    stage.cal = { key, k, d };
  }
}
