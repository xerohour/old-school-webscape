/* Shore surf (user ask 2026-10-30): procedural looping breakers from shaped
   white noise - no audio files. Volume follows the player's distance to the
   nearest shore, swelling at the beach and dying inland. The context starts on
   the first pointer/key gesture (autoplay rules). Toggle: additional settings
   "Shore sounds". Standalone on purpose: no imports, so neither game.js nor
   ui.js can form a module cycle through it. */

let ctx = null;
let master = null;
let level = 0;
let sampleAcc = 0;
let shoreD = 24;

const LS = "osws:surfOn";

export function isSurfOn() {
  try {
    return localStorage.getItem(LS) !== "0";
  } catch (e) {
    return true;
  }
}

export function setSurfOn(on) {
  try {
    localStorage.setItem(LS, on ? "1" : "0");
  } catch (e) {}
}

function ensure() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch (e) {
    return;
  }
  /* Pinkish noise: white through a one-pole lowpass, so the loop has body
     instead of hiss. */
  const len = 2 * ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const wht = Math.random() * 2 - 1;
    last = (last + 0.03 * wht) / 1.03;
    d[i] = last * 3.2;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 480;
  filt.Q.value = 0.4;
  /* Slow swell on loudness + slow wander on brightness: the two out-of-phase
     LFOs keep the loop from reading as a machine. */
  const swell = ctx.createGain();
  swell.gain.value = 0.75;
  const og = ctx.createOscillator();
  og.frequency.value = 0.07;
  const ogA = ctx.createGain();
  ogA.gain.value = 0.25;
  og.connect(ogA);
  ogA.connect(swell.gain);
  og.start();
  const of = ctx.createOscillator();
  of.frequency.value = 0.045;
  const ofA = ctx.createGain();
  ofA.gain.value = 220;
  of.connect(ofA);
  ofA.connect(filt.frequency);
  of.start();
  master = ctx.createGain();
  master.gain.value = 0;
  src.connect(filt);
  filt.connect(swell);
  swell.connect(master);
  master.connect(ctx.destination);
  src.start();
}

if (typeof window !== "undefined") {
  for (const e of ["pointerdown", "keydown", "touchstart"]) {
    window.addEventListener(e, ensure);
  }
}

/* Nearest-shore distance in tiles: land reads as terrain above the waterline,
   so no tile-id dependency. Sampled at ~2.5Hz, not per frame. */
function shoreDist(w, px, pz) {
  const wl = w.waterLevel + 0.04;
  for (let r = 0; r <= 24; r++) {
    for (let dx = -r; dx <= r; dx++) {
      if (w.heightAt(px + dx, pz - r) > wl || w.heightAt(px + dx, pz + r) > wl) return r;
    }
    for (let dz = -r + 1; dz <= r - 1; dz++) {
      if (w.heightAt(px - r, pz + dz) > wl || w.heightAt(px + r, pz + dz) > wl) return r;
    }
  }
  return 24;
}

export function tickSurf(dt) {
  const G = window.Game;
  if (!G || !G.ps || !G.world) return;
  sampleAcc += dt;
  if (sampleAcc > 0.4) {
    sampleAcc = 0;
    shoreD = shoreDist(G.world, Math.floor(G.ps.x), Math.floor(G.ps.z));
  }
  const target = !isSurfOn() || !ctx
    ? 0
    : Math.max(0, 1 - Math.max(0, shoreD - 2) / 18) * 0.4;
  level += (target - level) * Math.min(1, dt * 1.5);
  if (master) master.gain.value = Math.max(0, level);
}
