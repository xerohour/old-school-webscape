import { Game, createNpc, removeDynamicNpcs } from "./game.js";
import { chat, openClientTable, updateClientTable } from "./ui.js";
import { netBoard, netSubmitBoard } from "./net.js";

/* The island minigame dungeon: a speed-clear trial, one runner at a time per
   client. The dungeon rooms are shared ground (src/world.js#MINIGAME), but
   the cast is private - every runner's client raises its own ten bodies on
   entry (spawnIx 0xffff, so no census and no fight packet can ever name them;
   no drops, so no shared loot; no respawn, so a clear stays cleared) and
   takes them down again on the way out. Another player's ghost may walk the
   same rooms, but your fight is yours alone: the bodies only ever aggro you
   (src/combat.js aims NPCs at G.player and nothing else).

   The clock: `performance.now()` stamped on the arrival frame below (enter)
   and the arrival frame back up top (exit) - the same afterTicks beat both
   ends, so the measure is symmetric and exact every run. The screen timer is
   painted by its own rAF loop, which also watches the run die (death,
   logout) so a clock can never outlive its runner. Anything that is not a
   dungeon ladder leaving the dungeon - a teleport, a death - voids the run
   with no time (src/actions.js#teleportJump, src/combat.js#playerDeath). */

export function fmtMgMs(ms) {
  ms = Math.max(0, Math.round(ms));
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return m + ":" + String(s).padStart(2, "0") + "." + String(r).padStart(3, "0");
}

/* Records show whole seconds: every run starts and stops on a game tick, so
   a recorded time always lands on a perfect second anyway. The live timer
   above keeps its milliseconds - it is a stopwatch, not a record. */
export function fmtMgSec(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

let run = null;
let mgMobs = [];

export function mgActive() { return !!run; }

function timerEl() { return document.getElementById("mgTimer"); }

function paint() {
  if (!run) return;
  const p = Game.player;
  if (!p || p.dead || p.dying) { voidRun(); return; }
  const now = performance.now();
  /* The clear resolves on the 600ms combat tick, so checking it at 60fps is
     pure waste: gate it to 4Hz. Same for the timer text - the stopwatch stays
     exact (stamped from performance.now), only the DOM write is throttled. */
  if (!run.cleared && mgMobs.length && now - (run.lastClearCheck | 0) > 250) {
    run.lastClearCheck = now;
    /* The clear is called the moment it happens: ten bodies, every one down,
       and the runner still standing in the dungeon - once per run, so the line
       never repeats while they walk out. */
    if (mgMobs.every((n) => n.dead || (n.hp | 0) <= 0)) {
      run.cleared = true;
      chat("You've killed them all -- exit now!", "game");
    }
  }
  const el = timerEl();
  if (el) {
    el.hidden = false;
    if (now - (run.lastPaint | 0) > 100) {
      run.lastPaint = now;
      el.textContent = fmtMgMs(now - run.t0);
    }
  }
  run.raf = requestAnimationFrame(paint);
}

function stopPaint() {
  if (run && run.raf) cancelAnimationFrame(run.raf);
  const el = timerEl();
  if (el) el.hidden = true;
}

/* Raise this runner's private cast from the world's data rows
   (src/world.js#mgSpawns - data, never spawns, so spawnNpcs never sees it). */
export function spawnMgNpcs() {
  clearMgNpcs();
  const w = Game.world, v = Game.view;
  for (const s of (w.mgSpawns || [])) {
    const npc = createNpc(w, v, { ...s, noRespawn: true, noDrops: true });
    Game.npcs.push(npc);
    Game.entities.push(npc);
    mgMobs.push(npc);
  }
  return mgMobs.length;
}

export function clearMgNpcs() {
  if (!mgMobs.length) return;
  removeDynamicNpcs(mgMobs);
  mgMobs = [];
}

export function startRun() {
  spawnMgNpcs();
  if (run && run.raf) cancelAnimationFrame(run.raf);
  run = { t0: performance.now(), raf: 0 };
  const el = timerEl();
  if (el) {
    el.hidden = false;
    el.textContent = fmtMgMs(0);
  }
  run.raf = requestAnimationFrame(paint);
}

export async function finishRun() {
  if (!run) return;
  const ms = Math.max(1, Math.round(performance.now() - run.t0));
  run = null;
  stopPaint();
  /* A run only counts when the dungeon is fully cleared: anything still alive
     down there voids the record, the way a teleport or a death voids the run.
     The clock still stops and the private cast still comes down - there is
     just no time, no best and no board. */
  const alive = mgMobs.filter((n) => !n.dead && (n.hp | 0) > 0).length;
  clearMgNpcs();
  if (alive > 0) {
    chat("You climb out with " + (alive === 1 ? "1 monster" : alive + " monsters") + " still alive - the run doesn't count.", "game");
    return;
  }
  const ps = Game.ps;
  const prev = (ps && ps.mgBest2) | 0;
  const isPB = !prev || ms < prev;
  /* The board lives on the world server (check-and-replace top twenty -
     index.html's `board` table): "ok <rank> <wr>" for a board time, "no" for
     one that makes nothing, "denied" for a guest (no account to stamp), null
     offline. A run that never reaches the server still counts locally. */
  let wr = false, denied = false;
  try {
    const reply = await netSubmitBoard(ms);
    if (reply) {
      const parts = String(reply).split(" ");
      if (parts[0] === "denied") denied = true;
      else if (parts[0] === "ok") wr = parts[2] === "1";
    }
  } catch (e) {}
  if (isPB && ps) ps.mgBest2 = ms;
  /* Every full clear counts as a completion beside the best, boarded or not. */
  if (ps) ps.mgComp2 = Math.min(65535, ((ps.mgComp2 | 0) || 0) + 1);
  /* A world record is always a personal best too, so it says only the one -
     never both. */
  let msg = "You finish the dungeon run in " + fmtMgSec(ms) + ".";
  if (wr) msg += " (new world record)";
  else if (isPB) msg += " (new personal best)";
  else if (denied) msg += " (log in to enter the records)";
  chat(msg, "game");
}

export function voidRun(why) {
  if (!run) return;
  run = null;
  stopPaint();
  clearMgNpcs();
  if (why === "tele") chat("Your dungeon run is void - only a dungeon ladder stops the clock.", "game");
}

/* The record boards outside the two mouths: the server's top twenty plus
   your own best, read fresh every time (a board that went stale would crown
   yesterday's record). The window is the reusable client table (the bank's
   own riveted shell + its real scrollbar, src/ui.js#openClientTable): a
   scrolling table of all twenty places, Username / Time / Completions, "-"
   wherever a place is empty. Your own Personal Best merges into the table in
   time order when the server does not already hold it (a submit that never
   persisted - an unsaved preview's temporary server, or offline - still
   leaves the time in the character save, so the table shows it rather than a
   blank). Every server name on it passed the server's own account check. */
export function openMgBoard() {
  openClientTable({
    title: "Dungeon Run",
    columns: ["Username", "Time", "Completions"],
    rows: [["Fetching the records...", "", ""]],
    footer: "",
  });
  fillMgBoard();
}

function pbFooter() {
  const pb = (Game.ps && Game.ps.mgBest2) | 0;
  return pb ? "Personal Best: " + fmtMgSec(pb) : "Personal Best: -:--";
}

async function fillMgBoard() {
  let rows = null;
  try { rows = await netBoard(); } catch (e) { rows = null; }
  if (!rows) {
    updateClientTable({ rows: [["The records board is unreachable - you are offline.", "", ""]], footer: pbFooter() });
    return;
  }
  let list = rows.slice(0, 20);
  const pb = (Game.ps && Game.ps.mgBest2) | 0;
  const me = (Game.ps && Game.ps.name) || "";
  /* Your best belongs on the board: when the server does not already hold
     it, it joins the display in time order, carrying your own completions
     count beside it. */
  if (pb > 0 && me && !list.some((r) => r.name.toLowerCase() === String(me).toLowerCase())) {
    const mine = { name: String(me), ms: pb, comp: ((Game.ps && Game.ps.mgComp2) | 0) || 1 };
    let at = list.findIndex((r) => pb < r.ms);
    if (at < 0) at = list.length;
    list.splice(at, 0, mine);
    list = list.slice(0, 20);
  }
  const table = [];
  for (let i = 0; i < 20; i++) {
    const r = list[i];
    table.push([r ? r.name : "-", r ? fmtMgSec(r.ms) : "-", r && r.comp != null ? String(r.comp) : "-"]);
  }
  updateClientTable({ rows: table, footer: pbFooter() });
}
