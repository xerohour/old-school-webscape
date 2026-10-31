/* ==========================================================================
   renderopts.js — the renderer switches the player can change.

   The options panel's own six toggles are the cache's (see src/ui.js), but the
   two settings that belong to *this* world's renderer have no interface behind
   them, so they live in a window of their own: the **"Open additional
   settings"** button at the foot of the options panel opens it (see
   src/ui.js#openExtraSettings), and this module is where their values live.

   They are here rather than in `ui.js` because of the import graph. The modules
   that *read* them sit below `ui.js` — `scene.js` creates the WebGL renderer,
   `models3d.js` blends animation frames — and must not import the interface
   back. `ui.js` owns the setting (it is saved with the rest of them, see
   `SETTINGS_KEY`), writes the value here through `applyRenderOptions`, and the
   low-level modules read `RenderOptions` at the moment they need it.

   At the user's own request (2026-09-20) **anti-aliasing, frame interpolation
   and the label shadow default on**, and the **whole-number zoom defaults off**:
   smooth edges, blended animation frames and the labels' drop shadow are what
   they want to see, and the frame fills the window rather than sitting at an
   exact multiple with background around it.
   ========================================================================== */

export const RenderOptions = {
  /* Anti-aliasing. The 3D view is drawn into a canvas whose drawing buffer is
     exactly the game's own 512x334 and shown at 512 CSS pixels (`#gameCanvas`
     in src/style.css, upscaled from there by the frame transform). Turning this
     on gives the renderer a drawing buffer of **twice** that in each direction
     while the CSS size stays put, so the browser's own downscale box-filters
     the edges: supersampling, which is real anti-aliasing rather than a blur,
     and it costs four times the fill rate. `View.setAntialias` does the two
     halves — the buffer size and the canvas's `image-rendering`, which has to
     stop being `pixelated` or the downsample would pick one texel in four
     instead of averaging them. **On by default (2026-09-20)**, at the user's
     request. */
  antialias: true,

  /* Frame interpolation. The cache stores animations as keyframes, and
     `models3d.js` blends between two of them in vertex space so a character
     moves smoothly through the sequence. Off, each keyframe is shown for its
     own delay and the next one snaps in - which is exactly what the client's
     own sequencer does (it steps a frame every `frameDelay` of the 20ms
     cycle), and is why turning this off looks like 2007 and turning it on looks
     like a modern engine. **On by default (2026-09-20)**, at the user's
     request. */
  frameInterpolation: true,

  /* The overhead labels' black drop shadow (src/fx.js#labelText). The client
     draws overhead names and chat as a black copy one pixel down and right with
     the coloured line over it, and this is what that is when it is on. **Off by
     default at the user's own request (2026-09-20)**: at the cache's twelve
     pixel size the offset copy reads as a heavy stroke on every letter, but the
     user asked for it back on (2026-09-20), so **on by default**: it is there
     unless turned off from the additional-settings window. Nothing else is
     affected - the hitsplats keep the client's own two-copy number either
     way. */
  textShadow: true,

  /* Frame zoom (src/gameframe.js#setScale): "fit" fills the window (the frame
     may land on a fractional scale; tiled-sprite seams there are handled
     structurally, src/ui.js#plateBacking); "exact" takes the largest scale at
     which one interface square is a whole number of screen pixels (a whole
     multiple of the 765x503 grid on ratio-1, 0.8x/1.6x/2.4x on ratio-1.25), so
     every interface pixel is an exact block of screen pixels; "full" scales to
     cover the window, cropping the overflow. "fit" by default (2026-09-20),
     at the user's request - the frame fills the window. */
  frameZoom: "fit",
};
