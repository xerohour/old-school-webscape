/* ===========================================================================
   pixelart.js — the handful of icons this interface needs that the 2007 cache
   cannot supply.

   Almost every sprite on screen is the real client's own art, blitted out of
   src/sprites/ui/frame.png. A few things are not, because they did not exist in
   2007: the message board's speech bubble (the cache's sideicon sheet has a
   house on that tab, and a house is not a chat), the little "i" that opens the
   board's own notice, and the marker that says "you are here" on the minimap
   (see below - the client draws a 3x3 white square there, and the player's own
   dot was a request).

   They are authored the same way the cache's own icons are: a grid of
   characters, one character per pixel, plus the palette the characters name.
   Every grid below uses the frame atlas's own colours (#000001 outline,
   #1d1d1d shadow, the stone/tan/blue-grey ramp), so an invented icon sits in
   the sheet's palette rather than next to it.

   Two consumers, two shapes of the same data:
     * pixelIcon(name)  -> { url, w, h }  a PNG data URL, for a CSS background
       (the tab icon), rendered 1:1 and scaled by the frame's transform with the
       rest of the interface artwork (`.spr` is image-rendering: pixelated).
     * drawPixels(ctx, name, x, y) -> paints the grid straight onto a canvas one
       pixel at a time, for the minimap marker - no image decode, no async, and
       no resampling on a canvas that is itself drawn 1:1.
   =========================================================================== */

const PALETTE = {
  ".": null,
  "#": "#000001",   /* the client's outline black */
  S: "#1d1d1d",     /* the client's drop shadow */
  A: "#c3b59f",     /* stone, lit */
  B: "#a38e6b",     /* stone, mid */
  C: "#6a5b48",     /* stone, shaded */
  L: "#8d8a9a",     /* sideicon blue-grey, lit */
  M: "#656279",     /* sideicon blue-grey, mid */
  D: "#424147",     /* sideicon blue-grey, shaded */
  W: "#fefefe",     /* marker white */
};

/* The message board's tab icon: a speech bubble with its tail at the
   bottom-left, in the sideicon sheet's blue-grey. 24x24 - the size the cache's
   own tab icons are (sideicon13, the house it replaces, is 24x24 at the same
   offset), so the two swap without moving anything else. The drawn art is
   centred in the 24x24 box (body rows 3-17, tail to row 20), because the box is
   what the frame centres in the tab slot: three blank rows above and below keep
   the bubble's own mass on the slot's centre line. The body's four corners are
   cut by one pixel, the same rounding the client's own small icons use, and the
   fill ramps from lit blue-grey at the top-left to shaded at the bottom-right so
   the bubble has the sheet's diagonal light like everything else in the atlas.

   The tail opens out of the body's bottom edge rather than sitting below a
   closed line (rows 17-20 turn four of the bottom outline's pixels into fill),
   so the outline runs continuously round body and tail - drawn under a closed
   bottom edge it reads as a detached blob even though the pixels touch. It
   tapers 4-3-2 pixels wide rather than 3-2-1: the frame is drawn at a fractional
   scale (765 design pixels across an 873-pixel frame), and a one-pixel neck can
   vanish into the nearest-neighbour step, which splits the tail off again. */
const BOARD_BUBBLE = [
  "........................",
  "........................",
  "........................",
  "....################....",
  "...#LLLLLLLLLLLLLLLL#...",
  "...#LLLLLLLLLLLLLLLL#...",
  "...#LLLLLLLLLLLLLLLL#...",
  "...#LLLLLLLLLLLLLLLM#...",
  "...#LLLLLLLLLLLLLLMM#...",
  "...#LLLLLLLLLLLLLMMM#...",
  "...#LLLLLLLLLLLLMMMM#...",
  "...#LLLLLLLLLLLMMMMM#...",
  "...#LLLLLLLLLLMMMMMM#...",
  "...#LLLLLLLLLMMMMMMM#...",
  "...#LLLLLLLLMMMMMMMM#...",
  "...#LLLLLLLMMMMMMMMM#...",
  "...#MMMMMMMMMMMMMMMM#...",
  "....#MMMM###########....",
  "....#MMM#...............",
  "....#MM#................",
  "....###.................",
  "........................",
  "........................",
  "........................",
];

/* The board panel's info button: a small stone plate with an "i" on it. 16x16,
   drawn at the top-right of the panel's title line. */
const INFO_BUTTON = [
  "................",
  ".##############.",
  ".#AAAAAAAAAAAA#.",
  ".#AAAAA##AAAAA#.",
  ".#AAAAA##AAAAA#.",
  ".#AAAAAAAAAAAA#.",
  ".#AAAAA##AAAAA#.",
  ".#AAAAA##AAAAA#.",
  ".#AAAAA##AAAAA#.",
  ".#AAAAA##AAAAA#.",
  ".#AAAAA##AAAAA#.",
  ".#AAAAA##AAAAA#.",
  ".#AAAAA##AAAAA#.",
  ".#AAAAAAAAAAAA#.",
  ".##############.",
  "................",
];

/* The player's own minimap marker.

   The client's own marker is not a sprite at all: `drawMinimap` ends with a
   flat fill-rect (317_Client.method336(3, 78, 97, 0xffffff, 3, 0)) - a 3x3
   white square on the map centre - while every *other* thing on the map is one
   of the five `mapdots` frames we carry in the atlas. This project drew that
   white sprite over the centre instead, which is the "another player" dot, and
   it reads as a plain white square (user report: "your own character dot in the
   minimap is actually a white square"). The player now gets a proper dot: a 7x7
   white disc with the client's own outline black round it - the widest row is
   five pixels of white, and the four corners are cut, so the silhouette is a
   circle rather than a block; at three pixels the white core was still a square,
   which is the very complaint this fixes. It is a size up from the 4x5 mapdots
   so your own marker stays easy to tell apart from the crowd. This is a
   deliberate departure from the client's flat fill-rect, at the user's request.
   Ghosts (other players) keep the cache's white mapdots dot. */
const PLAYER_DOT = [
  "..###..",
  ".#WWW#.",
  "#WWWWW#",
  "#WWWWW#",
  "#WWWWW#",
  ".#WWW#.",
  "..###..",
];

export const PIXEL_ART = {
  boardBubble: { rows: BOARD_BUBBLE, palette: PALETTE },
  infoButton: { rows: INFO_BUTTON, palette: PALETTE },
  playerDot: { rows: PLAYER_DOT, palette: PALETTE },
};

/* name -> a canvas built once. The tab icon is asked for on every frame build,
   and the PNG is a few hundred bytes, so one canvas each is all it ever needs. */
const _canvases = {};

function canvasFor(name) {
  const def = PIXEL_ART[name];
  if (!def) {
    console.warn("pixelart: no such icon:", name);
    return null;
  }
  if (_canvases[name]) return _canvases[name];
  const h = def.rows.length;
  const w = Math.max(...def.rows.map((r) => r.length));
  for (let y = 0; y < h; y++) {
    /* a hand-authored grid is one typo away from a ragged row, and a short row
       silently loses the icon's right-hand outline (which is exactly how the
       board bubble first rendered), so say so rather than draw it wrong */
    if (def.rows[y].length !== w) console.warn("pixelart: ragged row " + y + " in", name);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = def.palette[def.rows[y][x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  _canvases[name] = c;
  return c;
}

/* The icon as a PNG data URL plus the size to draw it at. */
export function pixelIcon(name) {
  const c = canvasFor(name);
  if (!c) return null;
  return { url: c.toDataURL(), w: c.width, h: c.height };
}

/* Paint the icon onto a 2d context at (x, y), one source pixel per canvas
   pixel. */
export function drawPixels(ctx, name, x, y) {
  const c = canvasFor(name);
  if (!c) return;
  ctx.drawImage(c, 0, 0, c.width, c.height, Math.round(x), Math.round(y), c.width, c.height);
}
