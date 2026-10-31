import { chat, mark, UI, setBankScroll, bankScrollValue } from "./ui.js";
import { Net } from "./net.js";import { bookById, spellById } from "./magic.js";
import { SKILLS } from "./skills.js";
import { xpForLevel, MAX_LEVEL } from "./util.js";
import { INV_SIZE, BANK_SIZE, grantStarterKit, STARTER_KIT_VERSION, nameError, setTutStage } from "./player.js";
import { EQUIP_SLOTS } from "./items.js";
import { nearestWalkable } from "./pathfind.js";
import { placeEntity, setPlayerAppearance, entityAtTile } from "./game.js";
import { RUN_UNITS } from "./run.js";
import { PRAYERS } from "./prayer.js";

/* v2: run energy moved from a 0..100 percentage to the game's own 10,000 units,
   and the run on/off toggle became part of the save. */
const VERSION = 2;
const FOLDER = "webscape";
const KEY = "player";

function kv() {
  return (typeof root !== "undefined" && root.kv) || null;
}

/* When this browser last wrote (or read) this character - the save's own `at`
   stamp. The title screen's "You last logged in ..." line is what reads it (see
   src/titlescreen.js); everything else about a save travels in the blob. */
let lastSaved = 0;
export function lastSavedAt() { return lastSaved; }

function safeClone(v) {
  return JSON.parse(JSON.stringify(v));
}

/* Is this a prayer the book actually has? Used to keep a hand-edited (or older)
   save's quick-prayer set to names the game can switch on. */
function prayerKnown(name) {
  return PRAYERS.some((p) => p.name.toLowerCase() === String(name || "").toLowerCase());
}

/* An open trade escrows the items it is offering out of the pack (the client's
   trade window takes them out of the inventory too). This save is the only copy
   there is, so the offered stacks are put back for the duration of the write by
   the one module that knows where they came from (src/trade.js#initTrade) -
   nothing here has to know what a trade is. */
let invEscrow = null;
export function setInvEscrow(fn) { invEscrow = fn; }

export function serializeState(g) {
  const p = g.ps;
  const skills = {};
  for (const s of SKILLS) {
    const cur = p.skills[s.id];
    skills[s.id] = { level: cur.level, xp: Math.round(cur.xp) };
  }
  const inv = p.inv.map((s) => (s ? { id: s.id, qty: s.qty } : null));
  return {
    v: VERSION,
    at: Date.now(),
    name: p.name,
    named: !!p.named,
    x: +g.player.x.toFixed(2),
    z: +g.player.z.toFixed(2),
    dir: +g.player.dir.toFixed(3),
    /* The level the body is standing on (see world.js#UP_Y): a logout
       upstairs logs back in upstairs. */
    plane: g.player.plane || 0,
    hp: p.hp,
    maxHp: p.maxHp,
    maxPrayer: p.maxPrayer,
    runEnergy: Math.round(p.runEnergy),
    runEnabled: !!p.runEnabled,
    /* The special-attack bar is part of the account, not the session: the live
       game keeps whatever is left in it across a logout (only the 30-second
       *timer* resets). */
    specEnergy: p.specEnergy == null ? 100 : p.specEnergy,
    /* The spellbook the magic tab is open on. The live game keeps this with the
       account (you change it by praying at an altar and it stays changed), so a
       reload that dropped back to the standard book would lose a choice the
       player made. `applyState` validates it against `BOOKS`. */
    book: UI.book,
    /* Auto retaliate rides the save with the spellbook: it is the account's own
       toggle, so a logout that dropped it would lose a choice the player made. */
    autoRetaliate: !!UI.autoRetaliate,
    /* Where the bank list was scrolled to. The bank reopens where you left it
       (see setTab), and the save is what carries that across a reload. */
    bankScroll: bankScrollValue(),
    /* The friends list rides the save with the spellbook: it is the
       account's own list, so a reload that dropped it would forget every
       friend. Stored as plain names - online status is live roster state,
       recomputed whenever the list draws. */
    friends: UI.friends.filter((e) => e && typeof e.name === "string").map((e) => e.name),
    threadUnits: p.threadUnits || 0,
    styleIndex: p.styleIndex || 0,
    autocast: p.autocast == null ? null : p.autocast,
    /* Each staff's remembered autocast spell (see player.js) rides the save
       with the effective one, so no staff ever asks twice across a reload. */
    staffSpells: (p.staffSpells && typeof p.staffSpells === "object") ? { ...p.staffSpells } : {},
    prodAutocast: p.prodAutocast == null ? null : p.prodAutocast,
    prayerPoints: p.prayerPoints,
    prayers: (p.prayers || []).slice(),
    /* The quick-prayer set (src/prayer.js#toggleQuick): filtered against the
       book on the way in and on the way out, because a save is hand-editable
       and a name the book does not know would otherwise stick in the set. */
    quickPrayers: (p.quickPrayers || []).filter(prayerKnown),
    appearance: g.playerAppearance,
    skills,
    inv: invEscrow ? invEscrow(inv) : inv,
    equip: safeClone(p.equip),
    bank: p.bank.map((s) => (s ? { id: s.id, qty: s.qty } : null)),
    /* The remembered Withdraw-X amount (src/ui.js#bankWithdrawX): part of the
       account, so the menu keeps its "Withdraw <n>" row across a reload. */
    bankX: p.bankX | 0,
    stats: safeClone(p.stats || {}),
    /* The quest log (src/quests.js). It rides the save for the same reason the
       stats do: a save that dropped it would lose a half-finished wool hand-in
       and make the journal forget a quest the player had already begun. */
    quests: safeClone(p.quests || {}),
    /* The open doors, as world keys. A reload builds every leaf shut, so without
       this a player saved inside a shop wakes behind their own shut door - and
       online the ring snapshot only carries doors the server still holds open.
       `applyState` swings the leaves back; the server's snapshot corrects them
       after, so the world still wins where it speaks. */
    doors: (() => {
      const d = [];
      for (const [key, o] of g.world.objs) if (o && o.t === "door" && o.open) d.push(key);
      return d;
    })(),
    /* Which revision of the starting kit this character has been given
       (src/player.js#STARTER_KIT_VERSION). It is what makes the grant once per
       character: a save old enough to predate it loads, is given the kit, and
       writes the stamp back. */
    /* The minigame dungeon's personal best, in milliseconds. It rides the save
       with the kit stamp for the same reason: a best that dropped on reload
       would crown yesterday's run every session. Hand-editable like the rest
       of the blob, so it is validated to a sane positive number on the way
       in - and the 20-second autosave carries it home after a run. `mgBest2`:
       the 2026-10-14 fresh start (full-clear rule, completions board) renamed
       the field so every character starts with no records; the old `mgBest`
       still sitting in a blob is ignored and drops off on the next save. */
    mgBest2: (p.mgBest2 | 0) || 0,
    /* The dungeon run's successful completions, per user, beside the best -
       every full clear counts, boarded or not (an unsaved preview's temporary
       server, or offline, still leaves the time standing here). */
    mgComp2: (p.mgComp2 | 0) || 0,
    kit: p.kit || 0,
    tutHatTaken: !!p.tutHatTaken,
    tutStage: (p.tutStage | 0) || 0,
  };
}

/* A friends-list name off a hand-editable save, kept only when it is a name
   this build could have drawn (src/player.js#nameError). Shared by
   applyState and the live tests. */
const MAX_FRIENDS = 200;
export function sanitizeFriendNames(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  const seen = new Set();
  for (const n of list) {
    if (typeof n !== "string") continue;
    const name = n.trim();
    if (!name || nameError(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length >= MAX_FRIENDS) break;
  }
  return out;
}
/* Items removed from the roster, mapped to what an existing holding becomes on
   load - so a save written while the item existed does not keep a ghost id in
   the pack, bank or worn kit that no table, model or icon knows any more.
   2026-09-30: white_dhide_chaps_b deleted, chaps A kept as White d'hide chaps. */
const RETIRED_ITEMS = {
  white_dhide_chaps_b: "white_dhide_chaps_a",
  lunar_helm: null, lunar_torso: null, lunar_legs: null, lunar_gloves: null,
  lunar_boots: null, lunar_cape: null, lunar_amulet: null, lunar_staff: null,
};
function retiredItemId(id) {
  if (id in RETIRED_ITEMS) return RETIRED_ITEMS[id];
  return id;
}

export function applyState(g, data) {
  if (!data || typeof data.v !== "number" || data.v > VERSION) return false;
  /* when this character was last written, for the title screen's own "You last
     logged in ..." line (src/titlescreen.js) - the account path applies a blob
     without going through loadGame, so the stamp is taken here */
  lastSaved = data.at || 0;
  const p = g.ps;
  /* The character's own name. It is in the save because it is part of the
     character - the chatbox signs their lines with it, the world shows it over
     their head, the board's Name line starts from it - and a name chosen at the
     name step replaces the one the boot gave them (`createPlayerState(window.
     generatorName)`, src/game.js). A name this build could not have written is
     refused rather than drawn (src/player.js#nameError): a save lives in the
     browser's storage and can be hand-edited, and it must not be able to put a
     string on the interface that the bitmap font has no glyph for, or into the
     join packet the world server has to parse. */
  const savedName = typeof data.name === "string" ? data.name.trim() : "";
  if (savedName && !nameError(savedName)) p.name = savedName;
  /* Whether that name was *chosen* (src/charname.js) or is just the generator's
     placeholder the boot wrote - a save written before the name step existed
     carries the placeholder and no flag, so its character is offered the screen
     on the way in. */
  p.named = !!data.named;
  /* A save is a file in the browser's storage, so nothing about it is trusted
     any more than a name is (src/player.js#nameError): every level is clamped
     to the cap and its XP floored at what that level costs, rather than taken
     on faith. Without this, a level above MAX_LEVEL - written by an older build
     whose debug command allowed it, or edited by hand - came back out of the
     storage at boot and stayed there for good. */
  if (data.skills) {
    for (const s of SKILLS) {
      const saved = data.skills[s.id];
      if (!saved) continue;
      const level = Math.max(1, Math.min(MAX_LEVEL, Math.round(saved.level) || 1));
      p.skills[s.id].level = level;
      p.skills[s.id].xp = Math.max(xpForLevel(level), Math.round(saved.xp) || 0);
    }
  }
  p.maxHp = Math.max(10, data.maxHp || p.skills.hitpoints.level);
  p.hp = Math.min(p.maxHp, data.hp == null ? p.maxHp : data.hp);
  /* The prayer pool is derived from the prayer level, exactly as it is when the
     player is first created (src/player.js) - nothing in the game raises the
     cap above the level (an altar only refills it), so it is *read from the
     level* rather than trusted from the save. Trusting `data.maxPrayer` meant a
     save written while the field was wrong stayed wrong for good: it is not a
     value the player can see or fix, and every drain and refill is measured
     against it. */
  p.maxPrayer = Math.max(1, p.skills.prayer.level);
  const savedEnergy = data.runEnergy == null ? RUN_UNITS : data.runEnergy;
  p.runEnergy = Math.min(RUN_UNITS, Math.max(0, data.v < 2 ? savedEnergy * 100 : savedEnergy));
  p.runEnabled = !!data.runEnabled;
  p.specEnergy = Math.max(0, Math.min(100, data.specEnergy == null ? 100 : data.specEnergy));
  /* The 30-second clock starts fresh on a load, which is the live game's own
     logout rule. */
  p.specRegen = 0;
  p.threadUnits = data.threadUnits || 0;
  p.styleIndex = data.styleIndex || 0;
  /* the staff's autocast spell travels with the save, so a reloaded game goes
     on casting what it was casting */
  p.autocast = typeof data.autocast === "number" ? data.autocast : null;
  /* each staff's own memory travels too - validated to plain id pairs,
     because a save is hand-editable and a name the book does not know would
     otherwise stick. `spellById` is the book's own id table. */
  p.staffSpells = {};
  if (data.staffSpells && typeof data.staffSpells === "object") {
    for (const [staff, spell] of Object.entries(data.staffSpells)) {
      if (typeof spell === "number" && spellById.get(spell)) p.staffSpells[staff] = spell;
    }
  }
  const prod = spellById.get(data.prodAutocast);
  p.prodAutocast = prod && prod.prod ? data.prodAutocast : null;
  p.prayerPoints = data.prayerPoints == null ? p.skills.prayer.level : data.prayerPoints;
  /* a pool can never sit above the cap it is measured against */
  p.prayerPoints = Math.max(0, Math.min(p.maxPrayer, p.prayerPoints));
  p.prayers = Array.isArray(data.prayers) ? data.prayers.slice() : [];
  /* the quick-prayer set, with anything the book does not know dropped */
  p.quickPrayers = Array.isArray(data.quickPrayers) ? data.quickPrayers.filter(prayerKnown) : [];
  /* A pickpocket stun is deliberately NOT carried across a load. The live game
     clears the stun when you log out, and a save taken mid-stun would otherwise
     drop the player back in frozen with no memory of why; so the two Thieving
     timers (src/player.js#createPlayerState) always start clean here. */
  p.stunTicks = 0;
  p.pickpocketCd = 0;
  /* The food cooldown is the same kind of short-lived timer, and starts clean
     for the same reason (src/player.js#createPlayerState). */
  p.eatCd = 0;
  /* Herblore's three statuses follow the same rule: a poison, an antidote's
     immunity and an antifire all end at the logout, which is what the live game
     does with them (see src/player.js#createPlayerState). */
  p.poison = null;
  p.poisonImmune = 0;
  p.antifire = 0;
  p.antifireWarned = false;
  /* The spellbook travels with the save, but only if it names a book this
     revision still has - a save from a build with a different book list falls
     back to the standard book rather than showing an empty tab. */
  if (typeof data.book === "string") {
    const book = bookById(data.book);
    if (book && book.id === data.book) UI.book = book.id;
  }
  /* Missing (an older save) reads as on, which is the toggle's own default. */
  UI.autoRetaliate = data.autoRetaliate !== false;
  /* The bank scroll travels with the save for the same reason the spellbook
     does: reopening the bank puts you where you were, even across a reload. A
     hand-edited value is clamped into the list by the setter itself. */
  if (Number.isFinite(data.bankScroll)) setBankScroll(data.bankScroll);
  /* The remembered Withdraw-X amount rides the save with the bank itself, so
     the menu keeps its row across a reload. A hand-edited value is clamped to
     a plain non-negative integer rather than taken on faith. */
  p.bankX = Number.isFinite(data.bankX) ? Math.max(0, data.bankX | 0) : 0;
  /* The friends list, back out of the save - validated like a name the
     player typed, because a save is hand-editable (see sanitizeFriendNames).
     An older save simply carries no list and loads empty. */
  UI.friends = sanitizeFriendNames(data.friends).map((name) => ({ name, online: false }));

  const inv = new Array(INV_SIZE).fill(null);
  if (Array.isArray(data.inv)) {
    for (let i = 0; i < Math.min(INV_SIZE, data.inv.length); i++) {
      const s = data.inv[i];
      if (s && s.id) {
        const nid = retiredItemId(s.id);
        if (nid) inv[i] = { id: nid, qty: s.qty || 1 };
      }
    }
  }
  p.inv = inv;

  const bank = new Array(BANK_SIZE).fill(null);
  if (Array.isArray(data.bank)) {
    for (let i = 0; i < Math.min(BANK_SIZE, data.bank.length); i++) {
      const s = data.bank[i];
      if (s && s.id) {
        const nid = retiredItemId(s.id);
        if (nid) bank[i] = { id: nid, qty: s.qty || 1 };
      }
    }
  }
  p.bank = bank;

  /* Every slot gets a key, empty ones included: the worn-equipment panel, the
     kit packet and the two-handed/shield rules all read the equipment object by
     slot name, and a save written before a slot existed (the ammo slot, added in
     unit XXII) would otherwise leave that key `undefined` rather than `null`.
     Slots the save names that this revision does not have are dropped. */
  p.equip = {};
  for (const slot of EQUIP_SLOTS) {
    const s = (data.equip || {})[slot];
    const nid = s && s.id ? retiredItemId(s.id) : null;
    p.equip[slot] = nid ? { id: nid, qty: s.qty || 1 } : null;
  }
  p.stats = Object.assign({ kills: 0, deaths: 0, gpEarned: 0, questPoints: 0 }, data.stats || {});
  /* The quest log, taken as it was written and read back through
     src/quests.js's own accessors, which treat a missing field as "not begun" -
     so a save written before the quest came back loads as a fresh log rather
     than needing a migration here. */
  p.quests = data.quests && typeof data.quests === "object" ? Object.assign({}, data.quests) : {};

  const world = g.world;
  let tx = Math.floor(data.x || 62), tz = Math.floor(data.z || 57);
  /* A saved tile can be unwalkable now, or - more often, since a herd moves -
     occupied by a creature that has since wandered onto it. Either way the
     player is put on the nearest free tile rather than inside one: a creature
     sharing the player's tile is the same stacking bug as two sharing each
     other's. `g.player` is passed as `except` so the search counts only the
     creatures: another *player* is not an occupant to a player (src/game.js#
     isPlayerBody), and being nudged off your own saved tile because a stranger
     happens to be standing there would be the same bug the other way round. */
  const occupied = (x, z) => !!entityAtTile(x, z, g.player);
  const near = nearestWalkable(world, tx, tz, 16, occupied) || nearestWalkable(world, tx, tz, 16);
  if (near) { tx = near.x; tz = near.z; }
  else { tx = 62; tz = 57; }
  placeEntity(g.player, tx + 0.5, tz + 0.5, data.dir || 0, data.plane === 1 ? 1 : 0);
  p.x = g.player.x;
  p.z = g.player.z;
  /* The leaves the save stood open swing back with it - the flag alone would
     move no mesh (scene.js#_buildDoors builds each leaf outside the chunks),
     so the geometry is swapped here too, exactly as a click does. A key that
     names no door tile is dropped: the save is hand-editable and must not be
     able to plant flags on tiles it does not own. */
  if (Array.isArray(data.doors)) {
    for (const key of data.doors) {
      if (!Number.isInteger(key)) continue;
      const dx = key % world.w, dz = (key / world.w) | 0;
      const o = world.objAt(dx, dz);
      if (o && o.t === "door" && !o.open) { o.open = true; if (g.view) g.view.setDoorOpen(o, true); }
    }
  }
  if (data.appearance) setPlayerAppearance(data.appearance);

  mark("inv", "equip", "skills", "bank", "setup", "friends");

  /* A character saved before the starting kit existed (user request: "players
     when they log in should get some good gear") is given it here, on the way
     in, and the stamp is saved immediately rather than waiting for the 20s
     autosave - otherwise a player who reloads twice in a row is handed the kit
     twice. The save is quiet and fire-and-forget: the character is already
     loaded and playable either way. */
  p.kit = data.kit || 0;
  p.tutHatTaken = !!data.tutHatTaken;
  setTutStage(p, data.tutStage | 0);
  if (!p.tutHatTaken) {
    try {
      if (localStorage.getItem("osw:tutHatTaken") === "1") p.tutHatTaken = true;
      else {
        const raw = localStorage.getItem("osw:tutTaken");
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.some((s) => typeof s === "string" && s.includes("pirate_hat"))) p.tutHatTaken = true;
        }
      }
    } catch (e) {}
  }
  if (p.tutHatTaken) {
    try { localStorage.setItem("osw:tutHatTaken", "1"); } catch (e) {}
  }
  try {
    const HX = 47, HZ = 218;
    const ho = world.objAt(HX, HZ);
    if (p.tutHatTaken) {
      if (ho && ho.t === "tut_hat") {
        world.delObj(HX, HZ);
        try { g.view.rebuildChunkAt(HX, HZ); } catch (e) {}
      }
    }
    for (const n of g.npcs || []) {
      if (n && n.type === "scully") {
        n.hidden = !p.tutHatTaken;
        if (n.ch && n.ch.group) n.ch.group.visible = !!p.tutHatTaken;
      }
    }
  } catch (e) {}
  /* The minigame personal best: a positive millisecond count or nothing. A
     best with no completions beside it predates the counter, so it counts
     the one clear that set it. */
  p.mgBest2 = (typeof data.mgBest2 === "number" && isFinite(data.mgBest2) && data.mgBest2 > 0) ? Math.round(data.mgBest2) : 0;
  p.mgComp2 = (typeof data.mgComp2 === "number" && isFinite(data.mgComp2) && data.mgComp2 > 0) ? Math.min(65535, Math.floor(data.mgComp2)) : (p.mgBest2 > 0 ? 1 : 0);
  if (p.kit < STARTER_KIT_VERSION) {
    grantStarterKit(p);
    for (const id of Object.keys(p.skills || {})) {
      p.skills[id].level = MAX_LEVEL;
      p.skills[id].xp = xpForLevel(MAX_LEVEL);
    }
    p.maxHp = MAX_LEVEL;
    p.hp = MAX_LEVEL;
    if (p.skills.prayer) {
      p.maxPrayer = MAX_LEVEL;
      p.prayerPoints = MAX_LEVEL;
    }
    mark("inv", "equip", "bank", "skills");
    saveGame(g, true, true);
  }
  return true;
}

/* A character save is mostly empty slots: a fresh one is 3.4 KB of JSON of
   which 3.3 KB is `null,`. The local save can afford that (browser storage is
   per-player and roomy), but an account's blob lives in the world server's fixed
   50 MiB arena (index.html), where the difference is two thousand characters
   versus twenty thousand - so the **account** copy is trimmed of trailing empty
   inventory and bank slots before it is sent. `applyState` pads the arrays back
   out on the way in, so nothing else in the game has to know this happened. */
function trimTail(arr) {
  let end = arr.length;
  while (end > 0 && arr[end - 1] == null) end--;
  return arr.slice(0, end);
}

export function accountBlob(g) {
  const data = serializeState(g);
  data.inv = trimTail(data.inv);
  data.bank = trimTail(data.bank);
  return JSON.stringify(data);
}

/* How often the account is updated while playing. The local save keeps its own
   20-second clock; this one is deliberately slower, because it crosses the
   network and lands in storage that is shared with every other player. */
const SERVER_SAVE_MIN_MS = 30000;
let lastServerSave = 0;

function pushToAccount(g, force) {
  if (!Net.account) return;
  const now = Date.now();
  if (!force && now - lastServerSave < SERVER_SAVE_MIN_MS) return;
  lastServerSave = now;
  /* fire and forget: a save that cannot reach the server must never stop the
     player playing, and the local copy above is still there */
  Promise.resolve(Net.saveCharacter(accountBlob(g))).catch(() => {});
}

export async function saveGame(g, quiet, force) {
  const store = kv();
  pushToAccount(g, force);
  if (!store) return false;
  try {
    await store[FOLDER].set(KEY, serializeState(g));
    lastSaved = Date.now();
    if (!quiet) chat("Game saved.", "game");
    return true;
  } catch (err) {
    console.error("save failed", err);
    if (!quiet) chat("Could not save: " + (err && err.message ? err.message : err), "warn");
    return false;
  }
}

export async function loadGame(g) {
  const store = kv();
  if (!store) return false;
  try {
    const data = (await store[FOLDER].get(KEY)) || (await store[FOLDER].get(g.ps.name));
    if (!data) {
      chat("No saved game found. Progress will save automatically.", "game");
      return false;
    }
    lastSaved = data.at || 0;
    const ok = applyState(g, data);
    if (ok) chat("Welcome back, " + g.ps.name + ". Game loaded.", "game");
    return ok;
  } catch (err) {
    console.error("load failed", err);
    return false;
  }
}

export async function clearSave() {
  const store = kv();
  if (!store) return;
  await store[FOLDER].delete(KEY);
}

export function initSave(g) {
  UI.actions.save = () => saveGame(g, false, true);
  /* With an account loaded, "load" means the account's own copy - the character
     on the server, not the browser's. Without one it is the local save, exactly
     as before. */
  UI.actions.load = () => (Net.account ? Net.login(Net.account, "") : loadGame(g));

  let last = Date.now();
  const autosave = () => {
    last = Date.now();
    saveGame(g, true);
  };
  /* leaving the page is the one moment worth forcing the account update: the
     player may not come back for a week, and the send is synchronous enough to
     usually make it out */
  const leave = () => {
    last = Date.now();
    saveGame(g, true, true);
  };

  const prior = g.hooks.onTick;
  g.hooks.onTick = (dt) => {
    if (prior) prior(dt);
    if (Date.now() - last > 20000) autosave();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") leave();
  });
  window.addEventListener("pagehide", leave);
  window.addEventListener("beforeunload", leave);

  return loadGame(g);
}
