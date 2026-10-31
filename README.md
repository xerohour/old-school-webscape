# Old School Webscape — self-hosted port, playable on GitHub Pages

**Play it:** https://xerohour.github.io/old-school-webscape/

A complete, playable port of the **Old School Webscape** browser game — originally a
[Perchance](https://perchance.org) generator — rebuilt to run as a standalone static
site with zero backend.

## How to play

Open the link, press **Play Now**, design your character, and walk in. Click to walk
and interact; the chatbox takes `::` commands. Your character auto-saves to your
browser (localStorage) and is restored on your next visit.

## What this is

The original game is deeply wired into Perchance's backend (kv-plugin for saves,
server-plugin for the shared world, comments-plugin for the message board), and
Perchance offers no export — so the port recreates the whole platform surface the
game expects:

- **`src/port-shim.js`** provides the `root` global the game reads (every config value
  with the correct type), a localStorage-backed `kv` store for saves, and deliberately
  omits the server plugins so the game takes its designed offline path.
- The ~3,000-line server script was dropped; everything else is byte-identical to the
  original.
- Three.js still loads from CDN; all ~50 MB of game assets are served from this repo.

## What's different from the original

- **Single-player, offline.** There is no shared world on static hosting: no other
  players, no global chat, no online counter, no Perchance accounts, and the message
  board reports "unavailable". Your save lives in your browser instead of on an
  account.
- Everything else — the 3D town, NPCs, skills, combat, items, music, timed events —
  plays as the original.

## Port notes

- The Perchance file-store zip had corrupted every PNG (binaries read as text); the 22
  runtime-loaded sprites were re-downloaded individually and byte-verified.
- One real bug surfaced only off Perchance: the boot screen's `#loading` overlay was
  hidden with the `hidden` attribute, but its own `display: flex` rule overrode it —
  leaving an invisible, click-eating layer over the whole viewport. Fixed with a
  `[hidden] { display: none !important; }` reset in `src/style.css`.
- All credit for the game itself goes to its original author — this is a preservation
  port.
