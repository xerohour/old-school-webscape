/* --------------------------------------------------------------------- net

   The client half of the world server (the server itself is the
   `<script type="text/x-server-plugin">` element at the foot of index.html).
   Three things live here, and they are deliberately in one place because they
   share the one socket this game keeps open:

     1. **Presence.** Every tick the local player's position, facing, gait and
        hit points go out as a six-byte packet; the server stamps the sender's
        connection id on it and republishes it to the nine 16-tile chunks around
        that player (src/game.js#addGhost builds the other players from what
        arrives). The name and the worn equipment - the expensive part - travel
        separately, only when they change, and are re-sent every few seconds so a
        player who has just walked into view learns them.
     2. **Chat.** The public chat line. The chatbox owns the text and the
        styling (src/ui.js#chat); the server only relays, so what everyone reads
        is what the sender typed, minus anything that is not printable.
     3. **Accounts.** A username and a password give a character that follows
        the player to any browser (src/save.js stores it through here). The
        password itself never leaves this module: it is stretched with PBKDF2
        (WebCrypto - available in the page, unlike on the server) and only the
        derived token is sent. The server keeps SHA-256 of that token, so the
        token is a bearer credential and nothing more.

   **Nothing here is on the critical path of the game.** Every call fails soft:
   no socket, no accounts, and the game is exactly the single-player game it was
   - which is why the socket is optional everywhere it is used. The one thing
   that must always work is the reconnect, because a server restart (close code
   1012) or a sleeping laptop (1006) drops every socket, and a game that never
   came back would look broken rather than offline. */

import { addGhost, updateGhostState, setGhostKit, removeGhost, clearGhosts, sayOverhead, ghostSay, ghostEmote, ghostAction, isWorkPose } from "./game.js";
import { combatLevel } from "./skills.js";
import { overheadIndex } from "./prayer.js";
import { deathLine } from "./deaths.js";

/* message type bytes, matching the server's own constants in index.html */
const C_STATE = 1, S_STATE = 2, C_CHAT = 3, S_CHAT = 4;
const C_JOIN = 5, S_JOIN = 6, C_MOVE = 7, S_LEAVE = 8, S_HELLO = 9, S_ROSTER = 10;
const C_LEAVE = 37;

/* The bits of a state packet's flags byte - the fourth of its five payload
   bytes. Bit 0 is "walking" and bit 1 "running", both of which the receiving
   renderer reads (updateGhostState) and the server passes through without
   looking. Bit 2 is **STATE_AWAY**: I have switched away from this tab.

   It exists because switching tabs used to make a player vanish. The game's own
   tick stops with the render loop while a tab is hidden, so a backgrounded
   player stops sending anything at all - and after 75 seconds of that
   (GHOST_TIMEOUT_MS) every client nearby swept their ghost off the map. A player
   who came back from another tab found they had disappeared while they were
   gone. The tab's own clock (BEAT_MS) was supposed to be the answer, but a
   browser throttles a hidden tab's timers - to roughly one a minute after a few
   minutes, and then freezes the tab outright - so it is a race the client cannot
   reliably win.

   So it no longer tries to win it, it declares itself. `visibilitychange` is the
   one thing that always fires, and always *before* the throttling starts, so the
   packet it sends (watchVisibility) is the packet that counts: it says "I am
   away", and that single bit is enough, because everybody who receives it stops
   expecting anything more - the ghost is kept on the map (netFrame) and drawn
   with a grey name instead of a white one (src/fx.js#renderLabels, AFK_NAME_COLOR)
   by the people who can see them. The server keeps the same bit for the same
   reason, and re-announces the parked body to anyone who walks into view later
   (index.html#sendParked): silence from an away player is not absence, it is the
   whole point of being away. A closed socket is a different thing and still
   means gone (S_LEAVE). Must match index.html's own constant. */
const STATE_AWAY = 4;
/* The trade, added by the player menu (src/trade.js): a request and its answer,
   the two offer lists, and the server's own stage/end notices. Both accept
   clicks travel as one packet because the server knows which stage it is
   arbitrating - a client cannot ask to confirm a trade it has not yet seen the
   offer for. */
const C_TRADE_REQ = 11, C_TRADE_JOIN = 12, C_TRADE_ACCEPT = 13, C_TRADE_DECLINE = 14, C_TRADE_OFFER = 15;
const C_TRADE_SLOTS = 51;
const S_TRADE_REQ = 16, S_TRADE_OPEN = 17, S_TRADE_OFFER = 18, S_TRADE_STATUS = 19;
const S_TRADE_STAGE = 20, S_TRADE_END = 21, S_TRADE_INFO = 22;
const S_TRADE_SLOTS = 52;

/* The private message (the "Players Online" tab and the friends ledger): one
   line to one player, the privacy byte each client announces so the server can
   refuse a message to somebody who has private chat off, and the refusals it
   sends back - all matching index.html's own constants. */
const C_PM = 23, S_PM = 24, S_PM_INFO = 25, C_PRIVACY = 26;

/* An emote (src/emotes.js, and the emote book's 37 buttons). One byte each way:
   the emote's position in the book, since both clients have the same table and
   a name would be a string where a byte will do. The server only reflects it to
   the players standing near the one emoting, exactly as it does with chat - the
   point of an emote is that other people see it. */
const C_EMOTE = 27, S_EMOTE = 28;

/* The Lunar book's player-targeted spells, and Stat Spy's answer. The spell
   packet is a relay like an emote (`spell` is an id in the shared spell table,
   `power` its magnitude, `target` the connection it is aimed at); the stats
   packet is the answer to one of them, addressed back to the asker by id (see
   src/actions.js#castSpellOnPlayer and #statSpyCast, and the server's own note
   in index.html for why the answer is published rather than sent). */
const C_SPELL = 29, S_SPELL = 30;
const C_STATS = 31, S_STATS = 32;

/* A cast with no named player to tell it to (src/actions.js#remoteCastFx): the
   book's utility spells - teleports on the way out, Charge, alchemy, superheat,
   enchanting, bones-to-fruit, Telekinetic Grab, the lunar self and item line -
   which otherwise play only on the caster's own screen. Player-aimed casts
   already travel as C_SPELL and creature-aimed ones as C_SPELL with a spawn
   index, so this is only ever the self-cast remainder. It is visuals-only by
   contract: the receiver plays the pose and the gather graphic on the ghost and
   applies nothing, so it can never double a dose, a heal or a teleport offer.

     C_CAST  u16 spell
     S_CAST  u16 from, u16 spell */
const C_CAST = 47, S_CAST = 48;

/* A grab's flight (src/actions.js#remoteGrabFx): the missile and the burst of
   a Telekinetic Grab at the target tile the packet carries. The pose and the
   gather ball already travel as C_CAST; this carries the rest, which otherwise
   plays only on the caster's own screen. Visuals-only by the same contract as
   C_CAST: the receiver plays the flight and the burst on the ghost and applies
   nothing.

   These were 51/52 when the grab landed, which are the trade window's own
   slot packets (C_TRADE_SLOTS/S_TRADE_SLOTS above) - the two pairs shared
   both codes, and each side's length guard swallowed the other's packets, so
   no free-slot count ever reached a trade window again. They are 53/54 now,
   and src/tools/check-visibility.mjs asserts no two pairs share a code.

     C_GRABFX  u16 spell, u8 x, u8 z
     S_GRABFX  u16 from, u16 spell, u8 x, u8 z */
const C_GRABFX = 53, S_GRABFX = 54;

/* A one-shot graphic with no spell to carry it (src/actions.js#remoteGfxFx):
   the runecrafting swirl, the dark bow's shroud - anything a player does that
   plays a spotanim which is not a spell's gather, missile or burst. Poses
   travel as state (C_ACT) and spells under their own announcements, so this
   is only ever the graphic remainder, and it is visuals-only by the same
   contract as C_CAST: the receiver plays it riding the ghost and applies
   nothing. New one-shot graphics go through here rather than playing only at
   home - that is the visibility rule (src/tools/check-visibility.mjs).

     C_GFX   u16 gfx, u8 height
     S_GFX   u16 from, u16 gfx, u8 height */
const C_GFX = 55, S_GFX = 56;

/* The far side of a teleport (src/actions.js#remoteArrive): the arrival pose
   and the reversed bubble, played on the ghost at the destination tile, which
   rides in the packet so the arrival lands in the right place even if the
   caster's first state packet from the new tile has not arrived yet. Only
   teleports with an arrival pose send one - Teleother moves somebody else and
   has none, so its victims simply appear.

     C_ARRIVE  u16 spell, u8 x, u8 z
     S_ARRIVE  u16 from, u16 spell, u8 x, u8 z */
const C_ARRIVE = 49, S_ARRIVE = 50;
/* A player's fight, told to the players standing around them: the swing pose
   they are in and the hitsplats their blows are landing. Creatures are
   simulated by each client on its own, so the blow names the creature by its
   index in the world's spawn table - a table both clients build identically -
   with the tile kept as a fallback; see src/net.js#netCombat and
   src/game.js#ghostCombat, which is where the receiving end resolves the index.
   It is a relay exactly like an emote: one bounded packet in, the sender's id
   stamped on it, one publish to the neighbourhood - the only people who can see
   the fight - and the server never learns what any of the numbers mean. */
const C_COMBAT = 33, S_COMBAT = 34;

/* The creatures a player can see (src/net.js#netNpcStates, src/game.js
   #creatureStateBatch / #applyNpcStates). This is the packet that puts every
   client's copy of a creature on the same page: where it is, how hurt it is,
   and whether it is dead. A creature is named by its index in the world's spawn
   table (see the note on `ix` in netCombat above), and one packet carries a
   batch of them because what a client has to say is "these are the bodies near
   me", not one message per body. The server checks the count and the length,
   rate-limits it (`presenceLimits.npc`) and relays it to the neighbourhood -
   the same shape as a fight packet, and for the same reason. */
const C_NPC = 35, S_NPC = 36;

/* The most creatures one batch may carry, and the size of one entry: a spawn
   index, a tile, the hit points as a percentage, and a byte of flags (1 = the
   sender is fighting it, 2 = it is dead, 4 = its fleece is off). The sheep's bit
   is the one flag that is world state rather than a fact about the sender: a
   shorn sheep is shorn for everybody (src/game.js#applyNpcStates), so it is
   adopted from whoever reports it. Must match the server's own constants in
   index.html. */
const NPC_BATCH = 8;
const NPC_ENTRY_BYTES = 6;
/* How often the batch goes out even when nothing about it changed, so a player
   who has just walked into view gets a picture of the creatures without waiting
   for one of them to move. */
const NPC_HEARTBEAT_MS = 2000;

/* A player's *work* - the pose their body is in while an activity runs. Every
   other thing a player does is a moment with a packet of its own (a swing, a
   spell, an emote, a word); working is a *state*, and the pose is the whole of
   what a bystander sees, which is why it needs a channel rather than an event
   (the whole argument is src/game.js's note on WORK_POSES).

     C_ACT   u8 mask, u8 poseLen, pose, u8 toolLen, tool
     S_ACT   u16 from, u8 mask, u8 poseLen, pose, u8 toolLen, tool

   `mask` carries ACT_LOOP and ACT_TAIL, which are the two things the receiver's
   model needs to reproduce the sender's own request exactly: whether the pose is
   held and wrapped (a chop that repeats for as long as the activity runs) or
   played once, and whether the loop is entered at its tail frame rather than its
   head (src/actions.js#workAnim's `tail`). `pose` is empty for "the work is
   over". `tool` is the item the pose is performed with - the axe - and may be
   empty; it is what the ghost then holds in place of its weapon. Both strings are
   the cache's own keys, so the server (which only relays) never has to know what
   either means, and the receiving client drops a pose its own skeleton has not
   got. */
const C_ACT = 43, S_ACT = 44;
const ACT_LOOP = 1, ACT_TAIL = 2;
const ACT_NAME_MAX = 24;
/* How often a work pose is re-sent while it lasts. It is a *state*, so the
   repeat is what keeps a neighbour's ghost swinging when a packet goes missing
   and what teaches a player who has just walked into view; the change check
   means a player who is not working pays nothing for it. */
const ACT_HEARTBEAT_MS = 1500;
/* The signature of "this player's body is not doing any work", so that the first
   tick of every session does not send an empty pose packet for a player who has
   never picked up an axe. */
const ACT_NONE = "|0|0|";

/* ------------------------------------------------------------- the world ledger

   Everything else this module sends is about *us* - where we are, what we are
   wearing, what we said. This is the other half of multiplayer: state that
   belongs to the **world**, which one player changes and everybody else is
   standing in front of (index.html's ledger block is the server half, and
   src/actions.js#locBits is where a tile's bits come from). A door is the
   plainest example; a felled tree, a mined-out rock, a picked-clean stall, a lit
   fire and every item lying on the ground are all the same thing, so they all
   travel in one pair of packets rather than a pair per feature:

     C_WORLD       u8 kind, payload
     S_WORLD       u16 from, u8 kind, payload
     S_WORLD_SNAP  u8 cx, u8 cz, u16 count, (u8 kind, payload)*

   and three kinds of record:

    WK_LOC      x, z, bits, hp, remain16   - a *tile's* state
    WK_GROUND   x, z, qty16, base16, idLen, id...  - one pile of one item on a tile
    WK_SHOP     flags, nameLen, name, count, remain16, (idLen, id, qty16)*

   The map is 512 tiles deep and a byte holds 256, so a tile past z 255 cannot
   be named above. The live relay keeps the kind and inserts the ninth bit
   after the low byte (told apart by the length equation, which an old client
   fails and so drops); the snapshot's concatenated records cannot be told
   apart that way, so they use wide kinds instead (WK_LOC2, WK_GROUND2), which
   an old client ends its whole parse on rather than misreading.

   The server is authoritative here in a way it is for nothing else, because
   there is no per-client simulation to reconcile: it stores each record and
   hands it out again, and it hands a client the whole of the ring it has just
   walked into (`S_WORLD_SNAP`, sent on every chunk change) so that a player who
   arrives after the fact sees the world as it was left. Every record is an
   absolute state rather than a delta, which is what makes the sender's own echo
   and the ring snapshot idempotent - two things that are re-applied cannot
   double anything up.

   A shop is the one record that is not a place, so it is the one record the
   ring snapshot does not carry: it is filed under the shop's own name and asked
   for by name when a counter is opened (`netShopRequest`, whose answer is the
   shop's whole known shelf). See src/ui.js#applyShopStock. */
const C_WORLD = 40, S_WORLD = 41, S_WORLD_SNAP = 42;
const WK_LOC = 1, WK_GROUND = 2, WK_SHOP = 3;
/* Wide twins of the tile records, used only when z does not fit in one byte
   (the undercity sits at z 384-511). The live relay keeps the base kind and is
   told apart by its length equation, but snapshot records are concatenated
   with no total length, so there a new kind is the only unambiguous signal -
   an old client drops the record (its parser ends the whole snapshot on an
   unknown kind) rather than misreading everything after it. */
const WK_LOC2 = 4, WK_GROUND2 = 5;
const WK_GROUND32 = 6, WK_GROUND32W = 7;
/* The shop record's flags (see netShop): `SHOP_FULL` is the request a client
   makes when it opens a counter, and the answer it gets back - reset the shelves
   to the shop's own rows and lay this record over them; `SHOP_CLEAR` is the
   reset its own restock clock sends, and the world agreeing. */
export const SHOP_FULL = 1, SHOP_CLEAR = 2;
/* Must match index.html's own bounds: an item id is a client-side key, so the
   bound is the game's, not the protocol's. */
const WORLD_ID_MAX = 24;
const SHOP_NAME_MAX = 24;
const SHOP_ROWS_MAX = 256;

/* The private-chat modes, in the chatbox's own cycling order (src/gameframe.js
   CHAT_MODES.private: On, Friends, Off) - the same numbers the server keeps. */
export const PM_PRIVACY = { ON: 0, FRIENDS: 1, OFF: 2 };

/* Why a private message did not arrive: the player is gone (or has private chat
   off, which the live game also reports this way), it is our own name, or the
   server has had enough of us for a moment. */
export const PM_INFO = { GONE: 0, SELF: 1, RATE: 2 };

/* Why a trade ended, and the server's refusals, as plain numbers so the two
   sides cannot drift apart silently. The endings are named from the outside:
   DECLINED means *this* client declined, OTHER_DECLINED means the other one did,
   and each prints the sentence that is about them. */
export const TRADE_END = { DECLINED: 0, OTHER_DECLINED: 1, GONE: 2, LOST: 3, DONE: 4 };
export const TRADE_INFO = { BUSY: 0, GONE: 1, FAR: 2, SELF: 3, REJECTED: 4 };

/* The most item stacks one offer can carry, and the longest item id: both are
   the server's own bounds (index.html), repeated here so the client cannot
   build a packet the server will drop. */
const TRADE_SLOTS = 24;
const TRADE_ID_MAX = 24;

const CHUNK = 16;
/* The map is not square: it is 128 tiles across by 512 deep, mainland plus
   Cairn Isle waters plus the undercity's dirt continent (src/world.js). The
   chunk grid follows it: 8 columns of 16 tiles by 32 rows. One number cannot
   describe both axes, so cx and cz are clamped against their own count and the
   flat chunk index strides by the x count (chunkIndex/sendMove below) - which
   is why they are two constants and not one. */
const CHUNK_COUNT_X = 8;               /* 128 tiles / 16 = 8 chunks across */
const CHUNK_COUNT_Z = 32;              /* 512 tiles / 16 = 32 chunks deep */

/* The state packet goes out on every tick, changed or not: at 16 bytes it is
   cheaper than the bookkeeping that decides whether it changed, and a steady
   cadence is what keeps ghosts gliding instead of lurching. */
const ACTION_DELAY_MS = 120;
/* The socket's own clock, independent of the game's render loop. A hidden tab
   stops rendering and therefore stops ticking (src/game.js), so a player who
   switches tabs would send nothing at all and vanish from everyone else's
   screen - the bug this timer exists to fix. Timers keep running in a hidden
   tab (throttled, but running), so presence goes out either way; while the tab
   is visible this is a no-op, because every packet it would send has just been
   sent by the game's own tick. */
const BEAT_MS = 1500;
/* How often the name and the worn kit are re-sent. This is the expensive packet
   (a couple of hundred bytes), and the interval is what a player who has just
   come into view waits, at worst, to see a proper name over a body. */
const ROSTER_EVERY_MS = 5000;
/* A ghost nobody has spoken about for this long is gone, as a last resort - and
   only then: a peer that has *told* us it is away is never swept however long
   the silence lasts (see netFrame and STATE_AWAY), because that is the one
   silence we can be sure means "still there". It is deliberately far longer than
   the tick it used to be: the server now says
   so explicitly when a peer leaves the neighbourhood (index.html, S_LEAVE on
   close and on a chunk change), so silence no longer means absence - it means
   a tab whose timers have been throttled, or a connection that died without
   saying goodbye. 75 seconds covers the worst case of both (a backgrounded tab
   is throttled to a packet a minute, and a lost connection is noticed by the
   socket's own keepalive long before that). */
const GHOST_TIMEOUT_MS = 75000;

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 60000;

/* The longest display name that fits in a join packet. Account names are capped
   at 12 (the account RPCs' own rule); a guest's name is the character's, which
   is why this is larger. Must match the server's `nameLen` bound in index.html. */
const NAME_MAX = 24;

/* The account token is PBKDF2-SHA256 over the password; 120k rounds is the
   order of magnitude browsers use for local key derivation today and costs a
   few hundred milliseconds once per login. */
const KDF_ITERATIONS = 120000;

const kvFolder = "webscape";

/* ------------------------------------------------------------------ state */

const Net = {
  status: "offline",     /* offline | connecting | online */
  account: null,         /* the username whose character is loaded, or null */
  playersOnline: 0,      /* players in the world, from the "world" topic */
  rosterList: [],        /* [{id, name}] of everyone the server knows about */
  lastError: "",
};

let game = null;
let deps = {};

/* Whether this client has actually entered the world yet, asked of the caller
   (src/main.js hands in the welcome screen's own answer). Until it is true the
   client stays **silent**: no chunk, no join, no state packet - so it is on no
   roster, in nobody's neighbourhood and in no count. That is the client half of
   the presence fix in index.html (see `worldCount` there): a tab parked on the
   welcome screen, or on the character-design or name screen, used to announce
   itself with the placeholder character name (the generator's own name, from
   createPlayerState) and stand in the world as a body that nobody could reach -
   the user's report, 2026-09-22: *"it seems to be sometimes showing names of
   people who are actually not online"*. The default is "always in the world",
   so a harness that hands in no predicate behaves exactly as before. */
let inWorld = () => true;
/* ...and the edge of that transition, so the packets that were suppressed go
   out on the first tick after the welcome screen is left rather than waiting
   for the next chunk change. */
let wasInWorld = false;

/* May presence go out at all? The socket has to be up *and* the player has to
   have left the welcome screen (see `inWorld` above). Every presence packet in
   this module goes through the three senders below, and all three ask this - so
   one answer here silences the lot, and there is no path that can half-announce
   a player who has not entered the world. */
function canSend() {
  return Net.status === "online" && inWorld();
}

let socket = null;
let myId = -1;
let attempt = 0;
let timer = null;
let stopped = false;
let auth = null;           /* {name, token, salt} once logged in */
let chunk = -1;            /* chunk index (cx + cz * CHUNK_COUNT_X) we told the server about */
let lastJoinAt = 0;
let lastKitSig = "";
let lastNpcSig = "";       /* the creature census last sent, to detect change */
let lastNpcAt = 0;
let lastActSig = ACT_NONE; /* the work pose last sent, to detect change */
let lastActAt = 0;
let privacy = PM_PRIVACY.ON;   /* our own chatbox "Private chat" setting */
let ghostSweepAt = 0;
/* Whether this tab is hidden, as far as the wire is concerned (see STATE_AWAY).
   Kept in step with the document by watchVisibility, and *seeded* from it here,
   because a generator opened in a background tab is away from the moment it
   arrives - it is equally invisible either way, and saying so on the first
   packet is cheaper than saying so a minute later. */
let away = typeof document !== "undefined" && !!document.hidden;
const peers = new Map();   /* id -> {name, seenAt, away} */
let npcSentN = 0;
let npcSentT0 = 0;
const delayedFx = [];

function peerMetrics(peer) {
  if (!peer.m) peer.m = { n: 0, times: [], jitter: 0, pa: 0, ps: 0, delay: 0, lost: 0, seqN: 0, lastSeq: -1, div: 0 };
  return peer.m;
}

function notePeer(id, tSend) {
  let peer = peers.get(id);
  if (!peer) {
    peer = { name: "", seenAt: now(), away: false };
    peers.set(id, peer);
  }
  const t = now();
  peer.seenAt = t;
  const m = peerMetrics(peer);
  m.n++;
  m.times.push(t);
  if (m.times.length > 40) m.times.shift();
  if (tSend != null && tSend > 0) {
    let oneWay = t - tSend;
    if (oneWay < -2000 || oneWay > 60000) oneWay = 0;
    m.delay = m.delay ? m.delay * 0.9 + oneWay * 0.1 : oneWay;
    if (m.pa && m.ps) {
      const gap = Math.abs((t - m.pa) - (tSend - m.ps));
      m.jitter = m.jitter + (Math.min(gap, 5000) - m.jitter) / 16;
    }
    m.pa = t;
    m.ps = tSend;
  }
  return peer;
}

function noteSeq(peer, seq) {
  const m = peerMetrics(peer);
  if (m.lastSeq >= 0) {
    const gap = (seq - m.lastSeq - 1 + 256) % 256;
    /* A stall, not loss: sends are gapless now (every tick, faster while
       moving), so a gap past ~3 seconds of silence means the sender was gone -
       frozen tab, reconnect, hiccup - not that the wire ate packets one by one.
       Count the steady drip, not the outage, or one stall stains the lifetime
       number forever. */
    if (gap <= 32) m.lost += gap;
  }
  m.lastSeq = seq;
  m.seqN++;
}

export function netLinkReport() {
  const t = now();
  const out = [];
  for (const [id, peer] of peers) {
    if (id === myId) continue;
    const m = peer.m;
    if (!m || !m.n) continue;
    const first = m.times.length ? m.times[0] : t;
    const span = Math.max(1, (t - first) / 1000);
    out.push({
      id, name: peer.name || "Player",
      pps: m.times.length / Math.min(span, 40),
      lossPct: m.seqN ? Math.round((m.lost / (m.lost + m.seqN)) * 1000) / 10 : 0,
      jitterMs: Math.round(m.jitter * 10) / 10,
      delayMs: Math.round(m.delay * 10) / 10,
      div: Math.round((m.div || 0) * 100) / 100,
    });
  }
  const cspan = npcSentT0 ? Math.max(1, (t - npcSentT0) / 1000) : 0;
  return { selfSeq: stateSeq, peers: out, censusPps: cspan ? Math.round((npcSentN / cspan) * 100) / 100 : 0 };
}

function afterDelay(tSend, fn) {
  fn();
}

function drainDelayed() {
  if (!delayedFx.length) return;
  const t = now();
  for (let i = delayedFx.length - 1; i >= 0; i--) {
    if (delayedFx[i].at <= t) {
      const item = delayedFx.splice(i, 1)[0];
      try { item.fn(); } catch (err) { console.warn("net delayed fx failed:", err); }
    }
  }
}

const now = () => Date.now();

/* ------------------------------------------------------------------ helpers */

/* Callbacks belong to the interface, and the interface is allowed to have a bad
   day. A single thrown exception in a hook must never be able to stop the socket
   from opening or the world from being received, so every crossing back into
   another module goes through here. */
function fire(fn, ...args) {
  if (typeof fn !== "function") return;
  try { fn(...args); } catch (err) { console.warn("net callback failed:", err); }
}

function randomHex(bytes) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  let out = "";
  for (const v of b) out += v.toString(16).padStart(2, "0");
  return out;
}

function bytesToHex(b) {
  let out = "";
  for (const v of b) out += v.toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function deriveToken(password, saltHex) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: KDF_ITERATIONS, hash: "SHA-256" },
    key, 256,
  );
  return bytesToHex(new Uint8Array(bits));
}

/* Everything the browser will hand us has to survive a round trip through other
   people's screens, so it is stripped to printable ASCII here rather than
   trusted. (The chatbox itself renders text as text, so this is about reading
   well, not about injection.) */
function clean(text, max) {
  let out = "";
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    out += c >= 32 && c < 127 ? ch : " ";
    if (out.length >= max) break;
  }
  return out.trim();
}

/* The local player's own display name: the character's own name, in every case.
   An account does not shadow it - logging in writes the account's name onto the
   character (setCharacterName below) - because there is one answer to "what am I
   called" here, not one for the socket and another for the chatbox. Before the
   game exists (this module is wired up at the end of boot, src/main.js) there is
   no character to read, hence the fallback. */
function displayName() {
  const ps = game && game.ps;
  return (ps && ps.name) || "Guest";
}

function modFold() {
  try {
    const m = typeof root !== "undefined" && root.modAccount;
    return m ? String(m).toLowerCase() : "";
  } catch (e) { return ""; }
}

function ownMod() {
  const m = modFold();
  if (!m) return false;
  if (!!Net.account && Net.account.toLowerCase() === m) return true;
  try {
    const dn = (displayName() || "").toLowerCase();
    if (dn && dn === m) return true;
  } catch (e) {}
  return false;
}

/* An account's name IS the character's name. The world shows a player under the
   name they log in with - the roster, the name over their head and their own
   chatbox lines all read the name the socket sent - so the moment an account is
   known, that name is written onto the character. `Net.account` still answers
   "is there an account behind this character" (the corner line, the account
   panel), but nothing that *displays* the player reads it any more. */
function setCharacterName(name) {
  if (!game || !game.ps || !name) return;
  game.ps.name = name;
  /* an account's name counts as a chosen one: the name step has nothing left to
     ask a player who already has one (src/charname.js#needsNaming) */
  game.ps.named = true;
}

/* The kit packet: the appearance first (a skin name, so `::skin guard` shows as
   a guard to everyone), then one entry per *worn* equipment slot in the client's
   own order - empty for an empty slot - so the receiver can rebuild exactly what
   we are wearing without knowing anything about our items but their ids.
   `deps.equipSlots` is `items.js#KIT_SLOTS`, the ten slots that can appear on the
   body: the ammo slot is deliberately not sent, because ammunition is never
   drawn on a character (see src/items.js). */
function kitText() {
  const eq = (game.ps && game.ps.equip) || {};
  const keys = deps.equipSlots.map((slot) => (eq[slot] && eq[slot].id) || "");
  /* The third field is the player's own **Accept Aid** setting (the options
     panel's toggle, src/ui.js#acceptsAid). It rides the kit because the kit is
     the one packet that already carries a player's "about me" flags and is
     re-sent whenever they change - so a neighbour learns of a toggle within a
     tick of it happening, without a packet of its own. A caster needs it to
     know whether a heal would be welcome (and whether to spend a potion dose on
     that person), but the *decision* is still the mark's own: this field only
     lets the caster refuse early.

     The fourth field is the player's **combat level**, worked out here from the
     live skills (src/skills.js#combatLevel) because nobody else can work it out:
     another client sees a body and a kit, not a stat sheet. It is the same
     field the kit's other two are - a fact about the player that neighbours
     show - and the user asked for it in the right-click menu ("you need to show
     player combat levels next to their names btw now too in the right click menu
     so you will need to calculate them"). Riding the kit also means it cannot go
     stale: a level-up changes this string, and a changed kit is re-sent at once. */
  const level = game.ps && game.ps.skills ? combatLevel(game.ps.skills) : 0;
  return (game.playerAppearance || "male") + "|" + keys.join(",") + "|" +
    (deps.acceptsAid && deps.acceptsAid() === false ? "0" : "1") + "|" + level;
}

function parseKit(text) {
  const parts = String(text).split("|");
  const appearance = parts[0] || "male";
  const slotText = parts.length > 1 ? parts[1] : "";
  /* absent (an older client, or a peer whose kit predates the flag) reads as
     "accepting", which is the default the options panel starts at */
  const acceptAid = !(parts.length > 2 && parts[2].charAt(0) === "0");
  /* absent reads as 0, and the menu simply leaves the level off a player whose
     own client did not send one (an older build, or a body whose kit arrived
     before its first re-join) */
  const level = parts.length > 3 ? parseInt(parts[3], 10) || 0 : 0;
  if (slotText === "") return { appearance, slotKeys: [], acceptAid, combatLevel: level };
  return { appearance, slotKeys: slotText.split(","), acceptAid, combatLevel: level };
}

/* -------------------------------------------------------------- the socket */

function open() {
  if (stopped) return;
  const store = typeof root !== "undefined" ? root : null;
  if (!store || !store.createServerSocket) {
    Net.status = "offline";
    fire(deps.onStatus, Net.status);
    return;
  }
  Net.status = "connecting";
  fire(deps.onStatus, Net.status);
  let s;
  try {
    s = store.createServerSocket();
  } catch (err) {
    schedule();
    return;
  }
  socket = s;
  s.binaryType = "arraybuffer";
  s.addEventListener("open", onOpen);
  s.addEventListener("message", (ev) => onMessage(ev.data));
  s.addEventListener("close", (ev) => onClose(ev));
  s.addEventListener("error", () => {});
}

function schedule() {
  if (stopped) return;
  const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * Math.pow(2, attempt));
  attempt++;
  timer = setTimeout(() => {
    timer = null;
    open();
  }, backoff * (0.75 + Math.random() * 0.5));
}

function onOpen() {
  attempt = 0;
  myId = -1;
  chunk = -1;
  lastTileX = -1;
  lastTileZ = -1;
  lastJoinAt = 0;
  lastKitSig = "";
  lastNpcSig = "";
  lastNpcAt = 0;
  lastActSig = ACT_NONE;
  lastActAt = 0;
  Net.status = "online";
  fire(deps.onStatus, Net.status);
  /* Tell the server which chunk we are in *before* announcing ourselves, so the
     announcement is published to a neighbourhood we are actually subscribed to -
     otherwise a player who joined from across the map would be invisible until
     their first step. */
  sendMove(true);
  /* the private-chat mode goes out with every (re)introduction: the server is
     what refuses a message to somebody whose chat is off, and a server that has
     just rebuilt has never heard of us */
  sendPrivacy();
  sendJoin(true);
  sendState(true);
  remarkAuth();
}

/* The world server may rebuild its own globals after a timeout, a crash or an
   idle hibernation, and it announces itself again when it does (S_HELLO arrives
   a second time on a socket that is already open). Everything the server knew
   about us is gone at that moment - including our chunk subscription - so the
   address has to be re-sent, and the local "which chunk did I tell them" cache
   has to be forgotten first, because it is the only reason we would not send
   it. `myId` is re-read from the packet either way, since the rebuild may hand
   the connection a new id. */
function rejoin() {
  chunk = -1;
  lastTileX = -1;
  lastTileZ = -1;
  lastJoinAt = 0;
  lastKitSig = "";
  lastActSig = ACT_NONE;
  lastActAt = 0;
  /* the rebuilt server knows nothing of a trade this side was in the middle of,
     and would refuse every further trade packet for it */
  fire(deps.trade && deps.trade.onLost);
  sendMove(true);
  /* the private-chat mode goes out with every (re)introduction: the server is
     what refuses a message to somebody whose chat is off, and a server that has
     just rebuilt has never heard of us */
  sendPrivacy();
  sendJoin(true);
  sendState(true);
  remarkAuth();
}

function onClose(ev) {
  const code = ev && ev.code;
  if (socket) socket = null;
  Net.status = "offline";
  Net.playersOnline = 0;
  Net.rosterList = [];
  peers.clear();
  fire(deps.clearGhosts);
  /* A trade cannot outlive its socket: the other side has been told (or will
     time out), and this side's window is closed by the same hook that handles a
     decline, so the player is never left looking at an offer that can no longer
     be accepted. */
  fire(deps.trade && deps.trade.onLost);
  fire(deps.onStatus, Net.status);
  fire(deps.onRoster, []);
  if (code === 4403) {
    /* embedded somewhere other than perchance.org: permanent, never retry */
    stopped = true;
    Net.lastError = "Multiplayer is only available on perchance.org.";
    fire(deps.onStatus, Net.status);
    return;
  }
  if (code === 4000) {
    /* booted by the moderator (index.html#kickall): no reconnect, back to the
       title screen instead - the main game answers through deps.onKicked */
    stopped = true;
    fire(deps.onKicked, "kicked");
    return;
  }
  if (code === 4001) {
    /* logged in elsewhere (index.html#bootOlderSessions): one live session per
       account, so the older client is saved and sent back to the title screen
       with its own message instead of reconnecting */
    stopped = true;
    fire(deps.onKicked, "elsewhere");
    return;
  }
  if (code === 4429) {
    /* quarantined after repeated server failures - the reason carries the wait,
       and hammering it only extends the quarantine */
    const wait = parseInt(ev.reason, 10);
    if (isFinite(wait)) {
      timer = setTimeout(() => {
        timer = null;
        attempt = 0;
        open();
      }, wait + 1000);
      return;
    }
  }
  schedule();
}

export function netClose() {
  stopped = true;
  if (socket) socket.close();
}

function raw(bytes) {
  if (!socket || Net.status !== "online") return false;
  try {
    socket.send(bytes);
    return true;
  } catch (err) {
    return false;
  }
}

/* ------------------------------------------------------------- presence out */

function chunkIndex() {
  const p = game.player;
  const cx = Math.max(0, Math.min(CHUNK_COUNT_X - 1, Math.floor(p.x / CHUNK)));
  const cz = Math.max(0, Math.min(CHUNK_COUNT_Z - 1, Math.floor(p.z / CHUNK)));
  return cx + cz * CHUNK_COUNT_X;
}

function sendMove(force) {
  if (!canSend()) return;
  const idx = chunkIndex();
  if (!force && idx === chunk) return;
  chunk = idx;
  const cx = idx % CHUNK_COUNT_X;
  const cz = Math.floor(idx / CHUNK_COUNT_X);
  raw(new Uint8Array([C_MOVE, cx, cz]));
  /* a new neighbourhood has no idea who we are: announce again, immediately */
  sendJoin(true);
}

function sendJoin(force) {
  if (!canSend()) return;
  const kit = kitText();
  /* The cap is the *display* name's, not the account's: a guest is called after
     the character (which can be longer than the 12 an account name is allowed),
     and the roster showing a chopped-off name reads as a bug. */
  const name = clean(displayName(), NAME_MAX) || "Guest";
  if (!force && kit === lastKitSig && now() - lastJoinAt < ROSTER_EVERY_MS) return;
  lastJoinAt = now();
  lastKitSig = kit;
  const nameBytes = new TextEncoder().encode(name);
  const kitBytes = new TextEncoder().encode(kit);
  const out = new Uint8Array(3 + nameBytes.length + kitBytes.length);
  out[0] = C_JOIN;
  out[1] = nameBytes.length;
  out.set(nameBytes, 2);
  out[2 + nameBytes.length] = kitBytes.length;
  out.set(kitBytes, 3 + nameBytes.length);
  raw(out);
}

function remarkAuth() {
  if (!auth || !auth.name || !auth.token) return;
  try {
    const p = rpc("login", auth.name + " " + auth.token);
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}

/* A player's death, told to the **whole world** rather than to the players who
   can see them. Every other packet here is local by design - a swing, a spell,
   an emote, a word is worth saying only to the people standing near enough to
   watch - but a death is the one event a server of this kind posts to everyone,
   and that is what the user asked for: *"when someone dies, you should send a
   global message in the chat ... a random line saying how ______ got owned"*.

     C_DEATH  u8: nothing (the server knows who sent it)
     S_DEATH  u16 from, u8 nameLen, name

   The name travels *in* the packet rather than being looked up from a ghost,
   because the point of a global message is that it reaches players who cannot
   see the body: a client on the far side of the map has no ghost to read a name
   off (the roster would have it, but the roster is capped and is about who is
   online, not about who just died). The server takes the name from the same
   connection record every other packet is stamped from, so it cannot be spoofed
   by the sender. The line itself is picked on the receiving client (src/
   deaths.js), so the same death reads differently to different players. */
const C_DEATH = 45, S_DEATH = 46;

/* The five payload bytes: tile, facing, gait and hit points. The tile is one
   byte per axis, which still fits: the map is 128 tiles across by 192 deep
   (src/world.js#W, #H), and a byte holds 0-255. The facing is the client's own
   angle packed to a byte; the hit points are sent as a *percentage*, because
   the bar over another player's head has no business knowing their exact
   maximum. The one byte between the facing and the hit points is the flags: the
   two gait bits the renderer reads, and STATE_AWAY, which is the whole of what
   this client has to say about the tab it is sitting in (see STATE_AWAY). */
let stateSeq = 0;
let lastTileX = -1;
let lastTileZ = -1;

function stampBytes(t) {
  const v = Math.floor(t == null ? Date.now() : t) % 4294967296;
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

function readStamp(bytes, at) {
  if (bytes.length < at + 4) return null;
  const v = (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
  const n = Date.now();
  let d = (n - v) % 4294967296;
  if (d < 0) d += 4294967296;
  if (d > 2147483648) d -= 4294967296;
  return n - d;
}

/* The ninth bit of a tile z. The map is 512 deep and a byte holds 256, so
   every tile that crosses the wire carries its low byte in the old field and
   this bit in the packet's tail (state, census, combat tiles, arrivals and
   grabs) or beside it (ledger records). Old readers ignore the tail and keep
   reading the low byte, exactly as broken for them as before; new readers add
   the bit back. x never needs one (the map is 128 wide). */
const zhiBit = (z) => ((Math.floor(z || 0) >> 8) & 1);

function stateBytes() {
  const p = game.player;
  const fx = Math.max(0, Math.min(511, Math.floor(p.x)));
  const fz = Math.max(0, Math.min(511, Math.floor(p.z)));
  const x = fx & 0xff, z = fz & 0xff;
  const dir = Math.round((((p.dir % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 256) & 255;
  const ps = game.ps;
  const pct = ps && ps.maxHp > 0 ? Math.max(0, Math.min(100, Math.round((ps.hp / ps.maxHp) * 100))) : 100;
  const flags = (p.moving ? 1 : 0) | (p.gaitRun ? 2 : 0) | (away ? STATE_AWAY : 0) |
    ((game.ps ? overheadIndex(game.ps) : 0) << 3);
  const qx = Math.max(0, Math.min(3, Math.floor((p.x - Math.floor(p.x)) * 4)));
  const qz = Math.max(0, Math.min(3, Math.floor((p.z - Math.floor(p.z)) * 4)));
  const frac = (qx << 2) | qz;
  /* The previous tile rides whole but travels split, like the current one. */
  const pfx = lastTileX < 0 ? fx : lastTileX;
  const pfz = lastTileZ < 0 ? fz : lastTileZ;
  const px = pfx & 0xff, pz = pfz & 0xff;
  const t = stampBytes();
  /* The level rides as one trailing byte: old clients ignore the tail of what
     they hear, and an old 6-byte packet centres with plane 0 (see below). */
  const zhi = zhiBit(fz) | (zhiBit(pfz) << 1);
  return [x, z, dir, flags, pct, stateSeq & 0xff, frac, px, pz, t[0], t[1], t[2], t[3], p.plane || 0, zhi];
}

function sendState(force) {
  if (!canSend()) return;
  const b = stateBytes();
  /* Whole tiles, not the low bytes that travel: the next packet's previous
     tile must carry its own high bit. */
  lastTileX = Math.max(0, Math.min(511, Math.floor(game.player.x)));
  lastTileZ = Math.max(0, Math.min(511, Math.floor(game.player.z)));
  stateSeq = (stateSeq + 1) & 0xff;
  raw(new Uint8Array([C_STATE, b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14]]));
}

/* The work pose this player's body is in, if any, read straight off the local
   character's own pose state - the same fields the renderer is handed every
   frame (`castAnim`/`castLeft`/`castLoop`/`castTail`/`castTool`). It is
   deliberately not a second copy of "what am I doing": the activity machinery
   already raises the pose (src/actions.js#workAnim and the direct playCastAnim
   calls), so the wire carries what the body is actually drawn doing, and an
   activity that forgets to announce itself cannot put a ghost out of step with
   the person it belongs to. `isWorkPose` is the filter that keeps a spell's
   gather and a special attack's swing off this channel - they have their own
   packets, and would otherwise be played twice on every ghost. */
function actionBytes() {
  const p = game && game.player;
  const pose = p && p.castLeft > 0 && p.castAnim && isWorkPose(p.castAnim) ? p.castAnim : "";
  return {
    pose,
    loop: !!(pose && p.castLoop),
    tail: !!(pose && p.castTail),
    tool: pose && p.castTool ? String(p.castTool) : "",
  };
}

function sendAction() {
  if (!canSend()) return;
  const a = actionBytes();
  const sig = a.pose + "|" + (a.loop ? 1 : 0) + (a.tail ? 1 : 0) + "|" + a.tool;
  /* An idle player has nothing to say and no reason to keep saying it: the empty
     pose goes out once, when the work ends (it is the change), and never again
     - while a *pose* is re-sent on the heartbeat, because a pose is a state the
     people around us are drawing and a lost packet would freeze them mid-chop. */
  const idle = sig === ACT_NONE;
  if (sig === lastActSig && (idle || now() - lastActAt < ACT_HEARTBEAT_MS)) return;
  lastActSig = sig;
  lastActAt = now();
  const pose = new TextEncoder().encode(a.pose);
  const tool = new TextEncoder().encode(a.tool);
  if (pose.length > ACT_NAME_MAX || tool.length > ACT_NAME_MAX) return;
  const out = new Uint8Array(4 + pose.length + tool.length);
  out[0] = C_ACT;
  out[1] = (a.loop ? ACT_LOOP : 0) | (a.tail ? ACT_TAIL : 0);
  out[2] = pose.length;
  out.set(pose, 3);
  out[3 + pose.length] = tool.length;
  out.set(tool, 4 + pose.length);
  raw(out);
}

/* -------------------------------------------------------------- messages in */

function parseName(bytes, at, len) {
  let out = "";
  for (let i = 0; i < len; i++) {
    const c = bytes[at + i];
    out += c >= 32 && c < 127 ? String.fromCharCode(c) : "";
  }
  return out;
}

function onMessage(data) {
  if (typeof data === "string") {
    /* the one text contract this socket has: the online count on "world",
       exactly as the counter in the corner has always read it */
    const n = parseInt(data, 10);
    if (isFinite(n) && n >= 0) {
      Net.playersOnline = n;
      fire(deps.onCount, n);
    }
    return;
  }
  const bytes = new Uint8Array(data);
  if (!bytes.length) return;
  const type = bytes[0];

  if (type === S_HELLO) {
    /* The server says hello on every open, and again if it has had to rebuild
       its globals under us - so a hello arriving on a socket we are already
       known on means we have to re-introduce ourselves (see rejoin). */
    const again = myId !== -1;
    myId = bytes[1] | (bytes[2] << 8);
    if (again) rejoin();
    return;
  }

  if (type === S_STATE) {
    const id = bytes[1] | (bytes[2] << 8);
    if (id === myId) return;
    const ext = bytes.length >= 16;
    /* The 15-byte shape (17 on the wire with the id) appends the level. */
    const ext2 = bytes.length >= 17;
    /* The 16-byte shape (18 on the wire with the id) appends the tiles' ninth
       bits: bit 0 is z's, bit 1 the previous tile's. The parked stand-in
       below is 10 bytes with the bit at its own index 8, so the old branch
       reads it too (a live old-shape packet is 8 bytes and never reaches it). */
    const ext3 = bytes.length >= 18;
    const parkedHi = !ext && bytes.length >= 10;
    const zhi = ext3 ? bytes[17] : parkedHi ? bytes[8] : 0;
    const seq = ext ? bytes[8] : null;
    const frac = ext ? bytes[9] : 0;
    const tSend = ext ? readStamp(bytes, 12) : null;
    const peer = notePeer(id, tSend);
    if (seq != null) noteSeq(peer, seq);
    let st;
    if (ext) {
      const qx = (frac >> 2) & 3, qz = frac & 3;
      st = {
        x: bytes[3] + (qx + 0.5) / 4, z: bytes[4] + ((zhi & 1) << 8) + (qz + 0.5) / 4, centered: true,
        dir: bytes[5] / 256 * Math.PI * 2,
        moving: (bytes[6] & 1) !== 0, running: (bytes[6] & 2) !== 0, hp: bytes[7],
        away: (bytes[6] & STATE_AWAY) !== 0,
        overhead: (bytes[6] >> 3) & 7,
        bx: bytes[10], bz: bytes[11] + ((zhi & 2) << 7), t: tSend, seq,
        plane: ext2 ? bytes[16] & 1 : 0,
      };
    } else {
      st = {
        x: bytes[3], z: bytes[4] + ((zhi & 1) << 8), centered: false,
        dir: bytes[5] / 256 * Math.PI * 2,
        moving: (bytes[6] & 1) !== 0, running: (bytes[6] & 2) !== 0, hp: bytes[7],
        away: (bytes[6] & STATE_AWAY) !== 0,
        overhead: (bytes[6] >> 3) & 7,
      };
    }
    if (!game.ghosts.has(id)) {
      addGhost(id, { x: ext ? bytes[3] : st.x, z: ext ? bytes[4] + ((zhi & 1) << 8) : st.z, dir: st.dir, hp: st.hp, away: st.away, running: st.running });
      if (!peer.name) peers.set(id, peer);
    } else {
      peer.away = st.away;
    }
    updateGhostState(id, st);
    const g = game.ghosts.get(id);
    if (g) {
      const m = peerMetrics(peer);
      const div = Math.hypot(g.x - g.tx, g.z - g.tz);
      m.div = m.div ? m.div * 0.9 + div * 0.1 : div;
    }
    return;
  }

  if (type === S_JOIN) {
    const id = bytes[1] | (bytes[2] << 8);
    if (id === myId) return;
    const nameLen = bytes[3];
    const name = parseName(bytes, 4, nameLen);
    const kitLen = bytes[4 + nameLen];
    let kit = "";
    for (let i = 0; i < kitLen; i++) {
      const c = bytes[5 + nameLen + i];
      kit += c >= 32 && c < 127 ? String.fromCharCode(c) : "";
    }
    const peer = notePeer(id, null);
    if (!peer) peers.set(id, { name, seenAt: now() });
    else { peer.name = name; peer.seenAt = now(); }
    const parsed = parseKit(kit);
    if (!game.ghosts.has(id)) addGhost(id, { name, appearance: parsed.appearance, slotKeys: parsed.slotKeys, x: 0, z: 0, combatLevel: parsed.combatLevel });
    const ghost = setGhostKit(id, { name, appearance: parsed.appearance, slotKeys: parsed.slotKeys, combatLevel: parsed.combatLevel });
    /* the kit's Accept Aid field, kept where the spell code can read it
       (src/actions.js#acceptsAidBy): a caster checks it so a heal they are
       about to pay for will actually be welcome */
    if (ghost) ghost.acceptAid = parsed.acceptAid;
    if (peer) peer.acceptAid = parsed.acceptAid;
    return;
  }

  if (type === S_CHAT) {
    const id = bytes[1] | (bytes[2] << 8);
    if (id === myId) return;                       /* our own line, printed locally */
    notePeer(id, null);
    const mod = bytes[3] === 1;
    const len = bytes[4];
    const text = parseName(bytes, 5, len);
    const who = (peers.get(id) || {}).name || "Player";
    fire(deps.chat, text, "pub", who, mod);
    /* and over the speaker's own head, the way the client shows speech */
    ghostSay(id, text);
    return;
  }

  /* Somebody died (see the note on C_DEATH above). The line is picked here, on
     this client, so the same death reads differently on two screens; `peers` is
     preferred to the packet's own copy of the name when this client happens to
     know it, because a peer may have renamed itself since the join that built
     the ghost. */
  if (type === S_DEATH) {
    const id = bytes[1] | (bytes[2] << 8);
    /* Our own death is printed locally on the way out (see `netDeath`), and the
       broadcast comes back to us too - we are subscribed to it like everybody
       else - so it is dropped here exactly as our own chat line is. Without this
       a player's own death is announced to them twice, in two different wordings,
       because the *line is picked by whoever reads it*. */
    if (id === myId) return;
    const len = bytes[3];
    const who = (peers.get(id) || {}).name || parseName(bytes, 4, len) || "Someone";
    fire(deps.chat, deathLine(who), "death");
    return;
  }

  if (type === S_LEAVE) {
    const id = bytes[1] | (bytes[2] << 8);
    peers.delete(id);
    removeGhost(id);
    return;
  }

  /* Another player's work pose (see the note on C_ACT above, and src/game.js#
     WORK_POSES). The bytes are parsed defensively - this is a peer's packet,
     relayed rather than re-encoded - and an empty pose is the ordinary "the work
     is over". */
  if (type === S_ACT) {
    const id = bytes[1] | (bytes[2] << 8);
    if (id === myId) return;                       /* our own pose, already drawn */
    const mask = bytes[3];
    const poseLen = bytes[4];
    if (poseLen == null || poseLen > ACT_NAME_MAX) return;
    const pose = parseName(bytes, 5, poseLen);
    const toolAt = 5 + poseLen;
    const toolLen = bytes[toolAt];
    if (toolLen == null || toolLen > ACT_NAME_MAX) return;
    const tool = parseName(bytes, toolAt + 1, toolLen);
    notePeer(id, null);
    ghostAction(id, pose, (mask & ACT_LOOP) !== 0, (mask & ACT_TAIL) !== 0, tool);
    return;
  }

  if (type === S_ROSTER) {
    const count = bytes[1];
    const list = [];
    let at = 2;
    for (let i = 0; i < count; i++) {
      const id = bytes[at] | (bytes[at + 1] << 8);
      const len = bytes[at + 2];
      list.push({ id, name: parseName(bytes, at + 3, len) });
      at += 3 + len;
    }
    announceRoster(list);
    return;
  }

  /* ---------------------------------------------------------------- private

     A private message arriving for us. The sender's name travels with it
     because only the server knows who a connection is (the receiving client has
     no name for a peer it has never seen in the world), and the text is
     sanitised by the sender's client *and* bounded by the server; it is printed
     as text, never as markup (src/ui.js#privateMessage). */
  if (type === S_PM) {
    const id = bytes[1] | (bytes[2] << 8);
    const nameLen = bytes[3];
    const name = parseName(bytes, 4, nameLen);
    const len = bytes[4 + nameLen];
    const text = parseName(bytes, 5 + nameLen, len);
    if (!name || !text) return;
    fire(deps.onPM, name, text, false, id);
    return;
  }

  if (type === S_PM_INFO) {
    fire(deps.onPMInfo, bytes[1]);
    return;
  }

  /* An emote performed by somebody else (src/emotes.js). The receiving client
     looks the emote up in its own copy of the book and plays it on that ghost;
     an index this client's table does not have (a newer game, a stray packet)
     is simply dropped, which is why the payload is bounded on the server. */
  if (type === S_EMOTE) {
    const id = bytes[1] | (bytes[2] << 8);
    if (id === myId) return;
    const tSend = readStamp(bytes, 4);
    notePeer(id, tSend);
    const index = bytes[3];
    afterDelay(tSend, () => ghostEmote(id, index));
    return;
  }

  /* A player-targeted spell. Every client in earshot is told the same thing -
     who cast it, what they cast, who at, and how hard - and each one does the
     two things it can: plays the caster's pose on their ghost (so the spell is
     *seen* to be cast), and, if it is the client being aimed at, applies the
     effect to itself (src/actions.js#remoteSpell). That is what makes the
     target's own client the authority on the target's hitpoints, which is the
     only arrangement that needs no trust in the caster. A spell id this build
     does not know is dropped here rather than reaching the interface. */
  if (type === S_SPELL) {
    const id = bytes[1] | (bytes[2] << 8);
    const spell = bytes[3] | (bytes[4] << 8);
    const target = bytes[5] | (bytes[6] << 8);
    const power = bytes[7] | (bytes[8] << 8);
    const hasIx = bytes.length === 11 || bytes.length === 15;
    const ix = hasIx ? (bytes[9] | (bytes[10] << 8)) : 0xffff;
    const tSend = bytes.length === 13 ? readStamp(bytes, 11) : bytes.length === 15 ? readStamp(bytes, 13) : null;
    if (id !== myId) notePeer(id, tSend);
    else if (tSend != null) notePeer(id, tSend);
    afterDelay(tSend, () => fire(deps.spell, id, spell, target, power, ix));
    return;
  }

  /* Somebody else's self-cast (src/actions.js#remoteCastFx). The sender's own
     echo comes back to the sender and is dropped, because the local player has
     already watched themselves cast. */
  if (type === S_CAST) {
    if (bytes.length !== 5 && bytes.length !== 9) return;
    const id = bytes[1] | (bytes[2] << 8);
    if (id === myId) return;
    const spell = bytes[3] | (bytes[4] << 8);
    const tSend = readStamp(bytes, 5);
    notePeer(id, tSend);
    afterDelay(tSend, () => fire(deps.castFx, id, spell));
    return;
  }

  /* Somebody else's grab flight (src/actions.js#remoteGrabFx). The echo is
     dropped like a self-cast's: the flight was already flown at home. */
  if (type === S_GRABFX) {
    /* The wide shape inserts the tile's ninth bit after the low byte, in both
       the stamped and unstamped forms. */
    if (bytes.length !== 7 && bytes.length !== 8 && bytes.length !== 11 && bytes.length !== 12) return;
    const id = bytes[1] | (bytes[2] << 8);
    if (id === myId) return;
    const spell = bytes[3] | (bytes[4] << 8), gx = bytes[5], gz = bytes[6];
    const wide = bytes.length === 8 || bytes.length === 12;
    if (wide && (bytes[7] & ~1)) return;
    const gzFull = wide ? gz + ((bytes[7] & 1) << 8) : gz;
    const tSend = readStamp(bytes, wide ? 8 : 7);
    notePeer(id, tSend);
    afterDelay(tSend, () => fire(deps.grabFx, id, spell, gx, gzFull));
    return;
  }

  /* Somebody else's one-shot graphic (src/actions.js#remoteGfxFx). The echo
     is dropped like a self-cast's: the graphic already played at home. */
  if (type === S_GFX) {
    if (bytes.length !== 6 && bytes.length !== 10) return;
    const id = bytes[1] | (bytes[2] << 8);
    if (id === myId) return;
    const gfx = bytes[3] | (bytes[4] << 8), h = bytes[5];
    const tSend = readStamp(bytes, 6);
    notePeer(id, tSend);
    afterDelay(tSend, () => fire(deps.gfxFx, id, gfx, h));
    return;
  }

  /* Somebody else's teleport arrival (src/actions.js#remoteArrive). The echo
     is dropped like a self-cast's: the arrival was already played at home. */
  if (type === S_ARRIVE) {
    if (bytes.length !== 7 && bytes.length !== 8 && bytes.length !== 11 && bytes.length !== 12) return;
    const id = bytes[1] | (bytes[2] << 8);
    if (id === myId) return;
    const spell = bytes[3] | (bytes[4] << 8), ax = bytes[5], az = bytes[6];
    const wide = bytes.length === 8 || bytes.length === 12;
    if (wide && (bytes[7] & ~1)) return;
    const azFull = wide ? az + ((bytes[7] & 1) << 8) : az;
    const tSend = readStamp(bytes, wide ? 8 : 7);
    notePeer(id, tSend);
    afterDelay(tSend, () => fire(deps.arrive, id, spell, ax, azFull));
    return;
  }

  /* Another player's fight (src/net.js#netCombat, src/game.js#ghostCombat). The
     sender's own echo comes back to the sender - the server publishes to the
     whole neighbourhood - and is dropped, because the local player has already
     swung the weapon they are holding and already drawn their own hitsplat. The
     peer's clock is nudged like every other packet's, so a fighting player is
     plainly alive to the timeout. */
  if (type === S_COMBAT) {
    const id = bytes[1] | (bytes[2] << 8);
    if (id === myId) return;
    const tSend = readStamp(bytes, 9);
    notePeer(id, tSend);
    const kind = bytes[3], a = bytes[4], b = bytes[5], c = bytes[6];
    const ix = bytes.length >= 9 ? (bytes[7] | (bytes[8] << 8)) : 0xffff;
    /* The wide shape appends the tile's ninth bit after the stamp. */
    const wide = (kind <= 1) && (bytes.length === 14 || bytes.length === 10);
    const cw = wide ? c + ((bytes[bytes.length - 1] & 1) << 8) : c;
    afterDelay(tSend, () => fire(deps.combat, id, kind, a, b, cw, ix));
    return;
  }

  /* Another player's creatures (src/net.js#netNpcStates, src/game.js
     #applyNpcStates). The batch is parsed into plain entries here - the game
     side has no business reading wire offsets - and handed over with the id of
     the connection that sent it, because which of two players' copies of a
     creature wins is decided from that id (and the client's own). */
  if (type === S_NPC) {
    const id = bytes[1] | (bytes[2] << 8);
    if (id === myId) return;
    const count = bytes[3];
    if (!count || count > NPC_BATCH) return;
    if (bytes.length < 4 + count * NPC_ENTRY_BYTES) return;
    /* The wide shape appends one ninth-bit byte per entry after the run. */
    const wide = bytes.length >= 4 + count * (NPC_ENTRY_BYTES + 1);
    const hiAt = 4 + count * NPC_ENTRY_BYTES;
    notePeer(id, null);
    const list = [];
    for (let i = 0, at = 4; i < count; i++, at += NPC_ENTRY_BYTES) {
      list.push({
        ix: bytes[at] | (bytes[at + 1] << 8),
        x: bytes[at + 2] + 0.5,
        z: bytes[at + 3] + (wide ? (bytes[hiAt + i] & 1) << 8 : 0) + 0.5,
        hp: bytes[at + 4],
        engaged: (bytes[at + 5] & 1) !== 0,
        dead: (bytes[at + 5] & 2) !== 0,
        sheared: (bytes[at + 5] & 4) !== 0,
      });
    }
    fire(deps.npcState, id, list);
    return;
  }

  /* A change to the shared world, from whoever made it (src/actions.js
     #remoteLocState / #remoteGroundState, and index.html's ledger block for the
     shapes). The server is authoritative for these records and sends each one
     on to the sender's own neighbourhood, so this arrives for our own change
     too - which is harmless, because every record is an absolute state rather
     than a delta: a tile's bits, a pile's exact count. Applying the state
     something is already in is a no-op, so an echo cannot double anything, and
     a packet cannot go out of order. The sender's own clock is nudged like
     every other packet's, so a player who spends their time felling trees is
     plainly alive to the ghost timeout. */
  if (type === S_WORLD) {
    if (bytes.length < 4) return;
    notePeer(bytes[1] | (bytes[2] << 8), null);
    const kind = bytes[3];
    if (kind === WK_LOC) {
      /* The wide shape carries the tile's ninth bit after the low byte; the
         old 10-byte shape still passes, for a stale client's sake. */
      if (bytes.length !== 10 && bytes.length !== 11) return;
      const wide = bytes.length === 11;
      const z = wide ? bytes[5] + ((bytes[6] & 1) << 8) : bytes[5];
      if (wide && (bytes[6] & ~1)) return;
      const at = wide ? 7 : 6;
      fire(deps.worldLoc, bytes[4], z, bytes[at], bytes[at + 1], bytes[at + 2] | (bytes[at + 3] << 8));
    } else if (kind === WK_GROUND) {
      /* [S_WORLD][from][WK_GROUND][x][z][qty16][base16][idLen][id...] - the
         pile's new total plus the base it was computed from (see #netGround).
         The wide shape inserts the tile's ninth bit after the low byte; the
         old shapes without it still pass through (a stale client's report),
         with the base read as the qty itself. Each shape is accepted only if
         its length equation holds and its id reads clean, so the shapes can
         never be confused - the wide one is tried first. */
      if (bytes.length < 10) return;
      const from = bytes[1] | (bytes[2] << 8), x = bytes[4], z = bytes[5];
      let zh = 0, qb = 6;
      if (bytes.length >= 12 && (bytes[6] & ~1) === 0 && bytes.length === 12 + bytes[11]) {
        zh = bytes[6] & 1;
        qb = 7;
      }
      const zz = z + (zh << 8);
      const qty = bytes[qb] | (bytes[qb + 1] << 8);
      let id = null, base = qty;
      if (bytes.length >= qb + 6 && bytes.length === qb + 5 + bytes[qb + 4]) {
        const len = bytes[qb + 4];
        let s = "", ok = len > 0 && len <= WORLD_ID_MAX;
        for (let i = 0; ok && i < len; i++) {
          const c = bytes[qb + 5 + i];
          ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;
          s += String.fromCharCode(c);
        }
        if (ok) { id = s; base = bytes[qb + 2] | (bytes[qb + 3] << 8); }
      }
      if (id == null && bytes.length >= qb + 4 && bytes.length === qb + 3 + bytes[qb + 2]) {
        const len = bytes[qb + 2];
        let s = "", ok = len > 0 && len <= WORLD_ID_MAX;
        for (let i = 0; ok && i < len; i++) {
          const c = bytes[qb + 3 + i];
          ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;
          s += String.fromCharCode(c);
        }
        if (ok) id = s;
      }
      if (id == null) return;
      fire(deps.worldGround, from, x, zz, id, qty, base);
    } else if (kind === WK_GROUND32 || kind === WK_GROUND32W) {
      if (bytes.length < 16) return;
      const from = bytes[1] | (bytes[2] << 8), x = bytes[4];
      const wide = kind === WK_GROUND32W;
      const z = wide ? bytes[5] + ((bytes[6] & 1) << 8) : bytes[5];
      if (wide && (bytes[6] & ~1)) return;
      const qb = wide ? 7 : 6;
      if (bytes.length !== qb + 9 + bytes[qb + 8]) return;
      const qty = (bytes[qb] | (bytes[qb + 1] << 8) | (bytes[qb + 2] << 16) | (bytes[qb + 3] << 24)) >>> 0;
      const base = (bytes[qb + 4] | (bytes[qb + 5] << 8) | (bytes[qb + 6] << 16) | (bytes[qb + 7] << 24)) >>> 0;
      const len = bytes[qb + 8];
      let s = "", ok = len > 0 && len <= WORLD_ID_MAX;
      for (let i = 0; ok && i < len; i++) {
        const c = bytes[qb + 9 + i];
        ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;
        s += String.fromCharCode(c);
      }
      if (!ok) return;
      fire(deps.worldGround, from, x, z, s, qty, base);
    } else if (kind === WK_SHOP) {
      /* [S_WORLD][from][WK_SHOP][flags][nameLen][name][count][remain16] then
         (idLen, id, qty16) per row - a shop's change, or the answer to a
         request, or a clear. A malformed record ends the parse rather than
         being read past, and the shop is only handed on if every row is
         well-formed, so a short packet can never leave a half-applied shelf. */
      if (bytes.length < 10) return;
      const flags = bytes[4];
      const nameLen = bytes[5];
      if (!nameLen || nameLen > SHOP_NAME_MAX || bytes.length < 6 + nameLen + 3) return;
      let name = "";
      for (let i = 0; i < nameLen; i++) name += String.fromCharCode(bytes[6 + i]);
      let at = 6 + nameLen;
      const count = bytes[at++];
      if (count > SHOP_ROWS_MAX) return;
      const remain = bytes[at] | (bytes[at + 1] << 8);
      at += 2;
      const rows = [];
      for (let i = 0; i < count; i++) {
        if (at + 1 > bytes.length) return;
        const idLen = bytes[at++];
        if (!idLen || idLen > WORLD_ID_MAX || at + idLen + 2 > bytes.length) return;
        let id = "";
        for (let j = 0; j < idLen; j++) id += String.fromCharCode(bytes[at + j]);
        at += idLen;
        rows.push({ id, qty: bytes[at] | (bytes[at + 1] << 8) });
        at += 2;
      }
      fire(deps.worldShop, name, flags, rows, remain);
    }
    return;
  }

  /* The ledger of the ring this client has just walked into - or been given on
     entering the world (index.html sends it from C_MOVE, which covers both).
     src/actions.js#applyWorldRing lays it over a freshly reset ring, so anything
     the client still believed about those chunks and the packet does not name is
     dropped: that is what makes the snapshot the repair as well as the
     introduction. Records come in the same shapes as a live change; a record
     that would run past the end of the packet ends the whole parse rather than
     being read past. */
  if (type === S_WORLD_SNAP) {
    if (bytes.length < 5) return;
    const cx = bytes[1], cz = bytes[2];
    const count = bytes[3] | (bytes[4] << 8);
    const records = [];
    let at = 5;
    while (records.length < count) {
      if (at >= bytes.length) return;
      const kind = bytes[at++];
      if (kind === WK_LOC) {
        if (at + 6 > bytes.length) return;
        records.push({
          kind, x: bytes[at], z: bytes[at + 1], bits: bytes[at + 2], hp: bytes[at + 3],
          remain: bytes[at + 4] | (bytes[at + 5] << 8),
        });
        at += 6;
      } else if (kind === WK_LOC2) {
        /* The wide twin: same record with the tile's ninth bit after the low
           byte. Normalised to the base kind on the way out, so the ring below
           never learns there were two shapes. */
        if (at + 7 > bytes.length) return;
        if (bytes[at + 2] & ~1) return;
        records.push({
          kind: WK_LOC, x: bytes[at], z: bytes[at + 1] + ((bytes[at + 2] & 1) << 8),
          bits: bytes[at + 3], hp: bytes[at + 4],
          remain: bytes[at + 5] | (bytes[at + 6] << 8),
        });
        at += 7;
      } else if (kind === WK_GROUND) {
        /* [x][z][qty16][base16][idLen][id...] - the new shape, tried first; the
           old shape without base second. Records are concatenated, so there is
           no total-length equation to hold them to - but the shapes still
           cannot be confused: a new-shape id length is read where an old
           record keeps an id character (never below 48), and an old-shape id
           length is read where a new record keeps its base. Each shape is
           accepted only if its id reads clean. */
        if (at + 6 > bytes.length) return;
        const gx = bytes[at], gz = bytes[at + 1];
        const gqty = bytes[at + 2] | (bytes[at + 3] << 8);
        let gid = null, gbase = gqty, glen = 0;
        if (at + 7 <= bytes.length) {
          const nl = bytes[at + 6];
          let s = "", ok = nl > 0 && nl <= WORLD_ID_MAX && at + 7 + nl <= bytes.length;
          for (let i = 0; ok && i < nl; i++) {
            const c = bytes[at + 7 + i];
            ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;
            s += String.fromCharCode(c);
          }
          if (ok) { gid = s; gbase = bytes[at + 4] | (bytes[at + 5] << 8); glen = 7 + nl; }
        }
        if (gid == null) {
          const ol = bytes[at + 4];
          let s = "", ok = ol > 0 && ol <= WORLD_ID_MAX && at + 5 + ol <= bytes.length;
          for (let i = 0; ok && i < ol; i++) {
            const c = bytes[at + 5 + i];
            ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;
            s += String.fromCharCode(c);
          }
          if (!ok) return;
          gid = s; glen = 5 + ol;
        }
        records.push({ kind, x: gx, z: gz, qty: gqty, base: gbase, id: gid });
        at += glen;
      } else if (kind === WK_GROUND2) {
        /* The wide twin: same record with the tile's ninth bit after the low
           byte. Normalised to the base kind on the way out. */
        if (at + 7 > bytes.length) return;
        if (bytes[at + 2] & ~1) return;
        const wx = bytes[at], wz = bytes[at + 1] + ((bytes[at + 2] & 1) << 8);
        const wqty = bytes[at + 3] | (bytes[at + 4] << 8);
        let wid = null, wbase = wqty, wlen = 0;
        if (at + 8 <= bytes.length) {
          const nl = bytes[at + 7];
          let s = "", ok = nl > 0 && nl <= WORLD_ID_MAX && at + 8 + nl <= bytes.length;
          for (let i = 0; ok && i < nl; i++) {
            const c = bytes[at + 8 + i];
            ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;
            s += String.fromCharCode(c);
          }
          if (ok) { wid = s; wbase = bytes[at + 5] | (bytes[at + 6] << 8); wlen = 8 + nl; }
        }
        if (wid == null) {
          const ol = bytes[at + 5];
          let s = "", ok = ol > 0 && ol <= WORLD_ID_MAX && at + 6 + ol <= bytes.length;
          for (let i = 0; ok && i < ol; i++) {
            const c = bytes[at + 6 + i];
            ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;
            s += String.fromCharCode(c);
          }
          if (!ok) return;
          wid = s; wlen = 6 + ol;
        }
        records.push({ kind: WK_GROUND, x: wx, z: wz, qty: wqty, base: wbase, id: wid });
        at += wlen;
      } else if (kind === WK_GROUND32 || kind === WK_GROUND32W) {
        const wide = kind === WK_GROUND32W;
        if (at + (wide ? 12 : 11) > bytes.length) return;
        const gx = bytes[at];
        let gz = bytes[at + 1], qb = at + 2;
        if (wide) {
          if (bytes[at + 2] & ~1) return;
          gz = bytes[at + 1] + ((bytes[at + 2] & 1) << 8);
          qb = at + 3;
        }
        const gqty = (bytes[qb] | (bytes[qb + 1] << 8) | (bytes[qb + 2] << 16) | (bytes[qb + 3] << 24)) >>> 0;
        const gbase = (bytes[qb + 4] | (bytes[qb + 5] << 8) | (bytes[qb + 6] << 16) | (bytes[qb + 7] << 24)) >>> 0;
        const nl = bytes[qb + 8];
        let s = "", ok = nl > 0 && nl <= WORLD_ID_MAX && qb + 9 + nl <= bytes.length;
        for (let i = 0; ok && i < nl; i++) {
          const c = bytes[qb + 9 + i];
          ok = (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95;
          s += String.fromCharCode(c);
        }
        if (!ok) return;
        records.push({ kind: WK_GROUND, x: gx, z: gz, qty: gqty, base: gbase, id: s });
        at = qb + 9 + nl;
      } else {
        return;
      }
    }
    fire(deps.worldSnapshot, cx, cz, records);
    return;
  }

  /* Stat Spy's answer. Addressed to one connection and published to its
     neighbourhood, so everybody who hears it drops it unless the packet names
     them (see index.html's note on C_STATS). */
  if (type === S_STATS) {
    const from = bytes[1] | (bytes[2] << 8);
    const asker = bytes[3] | (bytes[4] << 8);
    if (asker !== myId) return;
    const len = bytes[5];
    fire(deps.spyStats, from, parseName(bytes, 6, len));
    return;
  }

  /* ---------------------------------------------------------------- trade

     Every trade packet is handed straight to src/trade.js - the window is the
     only thing that knows what the player is in the middle of. Nothing here
     decides anything, and nothing here prints anything: the module answers with
     chat lines, because a refusal ("that player is busy") and a result
     ("Accepted trade.") are part of the window's story, not the socket's. */
  if (type === S_TRADE_REQ) {
    const id = bytes[1] | (bytes[2] << 8);
    const len = bytes[3];
    fire(deps.trade && deps.trade.onRequest, id, parseName(bytes, 4, len));
    return;
  }

  if (type === S_TRADE_OPEN) {
    const id = bytes[1] | (bytes[2] << 8);
    const len = bytes[3];
    fire(deps.trade && deps.trade.onOpen, id, parseName(bytes, 4, len));
    return;
  }

  if (type === S_TRADE_OFFER) {
    const items = decodeOffer(bytes, 1);
    if (items) fire(deps.trade && deps.trade.onOffer, items);
    return;
  }

  if (type === S_TRADE_STATUS) {
    /* bit 0: the partner has agreed to this stage with an offer that is still
       the one this side is looking at. A changed offer clears it again. */
    fire(deps.trade && deps.trade.onStatus, bytes[1]);
    return;
  }

  if (type === S_TRADE_STAGE) {
    fire(deps.trade && deps.trade.onStage, bytes[1]);
    return;
  }

  if (type === S_TRADE_END) {
    const reason = bytes[1];
    /* A completed trade carries the final offered lists back, so each client
       moves exactly what the server saw rather than what it last sent. */
    const items = reason === TRADE_END.DONE ? (decodeOffer(bytes, 2) || []) : null;
    fire(deps.trade && deps.trade.onEnd, reason, items);
    return;
  }

  if (type === S_TRADE_INFO) {
    fire(deps.trade && deps.trade.onInfo, bytes[1]);
    return;
  }

  if (type === S_TRADE_SLOTS) {
    fire(deps.trade && deps.trade.onSlots, bytes[1]);
    return;
  }
}

/* Who is online changes slowly and matters socially, so the two diffs that are
   worth a line in the chatbox are printed: a name arriving and a name going.
   Everything else (the count, the list) is for the interface to read.

   The diff is taken over *connections*, not names: a player who renames is the
   same player, and printing "X has logged out. Y has logged in." for one rename
   would be both wrong and loud. Only an id that has appeared or gone says
   anything, and only its first name does. */
let lastNames = new Map();
function announceRoster(list) {
  const nowById = new Map();
  for (const p of list) if (p && p.name) nowById.set(p.id, p.name);
  if (lastNames.size) {
    for (const [id, name] of nowById) if (!lastNames.has(id) && name !== displayName()) fire(deps.chat, name + " has logged in.", "game");
    for (const [id, name] of lastNames) if (!nowById.has(id) && name !== displayName()) fire(deps.chat, name + " has logged out.", "game");
  }
  lastNames = nowById;
  Net.rosterList = list;
  fire(deps.onRoster, list);
}

/* ----------------------------------------------------------------- publicly */

/* Tell the world what this character is called *now*. The join packet is the
   only place the server learns a display name from, and it is otherwise re-sent
   on its own five-second clock (ROSTER_EVERY_MS) - which, after a rename, is
   five seconds of the old name on the roster and over the character's head. So
   renaming says so instead of waiting (src/charname.js). */
export function netRefreshName() {
  sendJoin(true);
}

/* Which private-chat mode our chatbox is on (src/ui.js#chatMode.private): On
   takes anything, Friends takes other people's friends-only, and Off tells the
   world we are not to be messaged at all. The *server* is what turns that into
   "That player is not online." for the sender, which is why the mode is sent
   rather than only applied locally. */
export function netSetPrivacy(mode) {
  const next = mode === PM_PRIVACY.FRIENDS ? PM_PRIVACY.FRIENDS
    : mode === PM_PRIVACY.OFF ? PM_PRIVACY.OFF : PM_PRIVACY.ON;
  if (next === privacy) return false;
  privacy = next;
  sendPrivacy();
  return true;
}

/* The mode byte on its own, sent when the setting changes and re-sent on every
   open (a rebuilt server has never heard of us - see rejoin). */
function sendPrivacy() {
  return raw(new Uint8Array([C_PRIVACY, privacy]));
}

/* A private message to one player, addressed by connection id. The sender's own
   line is printed locally first - speaking is a local act here, exactly as it is
   for public chat - and the server's answer (delivered, or a refusal, S_PM_INFO)
   follows. */
export function netPM(id, name, text) {
  const msg = clean(text, 200);
  if (!msg || id == null || id < 0) return false;
  fire(deps.onPM, name || "Player", msg, true);
  if (Net.status !== "online") {
    fire(deps.onPMInfo, PM_INFO.GONE);
    return false;
  }
  const bytes = new TextEncoder().encode(msg);
  const out = new Uint8Array(4 + bytes.length);
  out[0] = C_PM;
  out[1] = id & 0xff;
  out[2] = (id >>> 8) & 0xff;
  out[3] = bytes.length;
  out.set(bytes, 4);
  return raw(out);
}

/* The public chat line: print locally *first* (the client shows your own line
   the moment you press enter, and the server's echo of it is dropped by id). */
export function netSay(text) {
  const msg = clean(text, 200);
  if (!msg) return false;
  fire(deps.chat, msg, "pub", displayName(), ownMod());
  /* Your own line goes over your own head too, at the instant you press enter
     and whether or not anybody is listening - speaking is a local act, and the
     socket is not part of it. */
  sayOverhead(game && game.player, msg);
  if (Net.status !== "online") return false;
  const bytes = new TextEncoder().encode(msg);
  const out = new Uint8Array(2 + bytes.length);
  out[0] = C_CHAT;
  out[1] = bytes.length;
  out.set(bytes, 2);
  return raw(out);
}

/* This player has died: tell the whole world, and say it locally first (the
   notice is a chat line like any other, and your own screen is the first one it
   should appear on - src/combat.js#playerDeath is the caller). The packet is one
   byte: the server stamps the sender's id and the name it already holds for that
   connection (see the note on C_DEATH above), so there is nothing here to spoof
   and nothing here to bound. */
export function netDeath() {
  fire(deps.chat, deathLine(displayName() || "Someone"), "death");
  if (Net.status !== "online") return false;
  return raw(new Uint8Array([C_DEATH]));
}

/* An emote, told to the players standing around us. Unlike a chat line there
   is no local echo to print - the emote is already playing on this client (the
   caller plays it before calling this, src/actions.js#performEmote) - so this is
   nothing but one byte on the wire, and nothing at all when we are offline: an
   emote you cannot show anybody is still an emote you performed. `index` is the
   emote's position in src/emotes.js, which is the one thing both clients are
   guaranteed to agree on. */
export function netEmote(index) {
  if (!(index >= 0) || index > 255) return false;
  if (Net.status !== "online") return false;
  const t = stampBytes();
  return raw(new Uint8Array([C_EMOTE, index, t[0], t[1], t[2], t[3]]));
}

/* A player-targeted spell, told to the players standing around us. The caster's
   own client has already paid for it and played the pose; this is what lets the
   target's client apply it and everybody else's watch it happen. `self` is the
   caster's own connection id, which rides in the packet so a client that hears
   the echo knows the cast was its own and does not play it twice. */
export function netSpell(spellId, targetId, power, ix) {
  if (Net.status !== "online") return false;
  if (!(spellId >= 0 && spellId <= 0xffff)) return false;
  if (!(targetId >= 0 && targetId <= 0xffff)) return false;
  const p = Math.max(0, Math.min(0xffff, Math.round(power || 0)));
  const t = stampBytes();
  const i = ix == null ? 0xffff : Math.max(0, Math.min(0xffff, Math.round(ix)));
  return raw(new Uint8Array([C_SPELL, spellId & 0xff, (spellId >>> 8) & 0xff, targetId & 0xff, (targetId >>> 8) & 0xff, p & 0xff, (p >>> 8) & 0xff, i & 0xff, (i >>> 8) & 0xff, t[0], t[1], t[2], t[3]]));
}

/* A self-cast, told to the players standing around us (see C_CAST above). The
   caster's own client has already paid for it and played the pose; this is
   what lets everybody else watch it happen. Nothing is sent offline: a cast
   nobody can see is still a cast. */
export function netCast(spellId) {
  if (Net.status !== "online") return false;
  if (!(spellId >= 0 && spellId <= 0xffff)) return false;
  const t = stampBytes();
  return raw(new Uint8Array([C_CAST, spellId & 0xff, (spellId >>> 8) & 0xff, t[0], t[1], t[2], t[3]]));
}

/* A teleport's arrival, told to the players standing around the destination
   (see C_ARRIVE above). Sent from the landing tile the moment the jump fires,
   so the arrival is played where the caster actually lands. */
export function netArrive(spellId, x, z) {
  if (Net.status !== "online") return false;
  if (!(spellId >= 0 && spellId <= 0xffff)) return false;
  const bx = Math.max(0, Math.min(255, Math.round(x || 0)));
  const fz = Math.max(0, Math.min(511, Math.round(z || 0)));
  const bz = fz & 0xff;
  const t = stampBytes();
  return raw(new Uint8Array([C_ARRIVE, spellId & 0xff, (spellId >>> 8) & 0xff, bx, bz, zhiBit(fz), t[0], t[1], t[2], t[3]]));
}

/* A one-shot graphic with no spell to carry it, told to the players standing
   around us (see C_GFX above). An unknown id plays nothing on the far end
   (src/gfx.js#play returns null for it), so the bound here is the sender's
   own formality. Nothing is sent offline. */
export function netGfx(gfxId, height) {
  if (Net.status !== "online") return false;
  if (!(gfxId >= 0 && gfxId <= 0xffff)) return false;
  const h = Math.max(0, Math.min(255, Math.round(height || 0)));
  const t = stampBytes();
  return raw(new Uint8Array([C_GFX, gfxId & 0xff, (gfxId >>> 8) & 0xff, h, t[0], t[1], t[2], t[3]]));
}

/* A grab's flight, told to the players standing around the caster (see
   C_GRABFX above). Sent with the cast, from the target tile, so the watchers'
   missile flies where the caster's own does. Nothing is sent offline. */
export function netGrabFx(spellId, x, z) {
  if (Net.status !== "online") return false;
  if (!(spellId >= 0 && spellId <= 0xffff)) return false;
  const bx = Math.max(0, Math.min(255, Math.round(x || 0)));
  const fz = Math.max(0, Math.min(511, Math.round(z || 0)));
  const bz = fz & 0xff;
  const t = stampBytes();
  return raw(new Uint8Array([C_GRABFX, spellId & 0xff, (spellId >>> 8) & 0xff, bx, bz, zhiBit(fz), t[0], t[1], t[2], t[3]]));
}

/* One beat of the local player's fight, told to the players around them - the
   swing they are in, a hitsplat, or a creature's cast on them. Four small
   kinds share one packet because they are the same message ("something is
   happening in this fight") and the server's job with each is identical:

     0  a swing at a tile - `a` is a sequence in the shared table both clients
        build (src/items.js#combatAnims, which is why an index travels rather
        than a name), `b`/`c` the tile attacked;
     1  a blow on a creature at a tile - `a` is the damage, `b`/`c` the tile;
     2  a blow on the player themselves - `a` is the damage, `b` the style
        (0 melee, 1 range, 2 magic), `c` the hitsplat when a magic blow lit
        the ring shields (else 0);
     3  a creature's cast at the player - `a` is the cast's index in the
        shared table both clients derive (src/combat.js#CREATURE_CASTS, 128
        plus the missile row for Karil's bolt).

   `ix` names the creature by its index in the world's spawn table, which every
   client builds identically (src/game.js#spawnNpcs): the receiving end has its
   own copy of that same spawn, so the blow lands on the right body even though
   the two copies have wandered apart (src/game.js#ghostCombat). 0xffff is "no
   creature to name" - a kind-2 blow, an archetype preview - and the tile bytes
   remain the fallback for it.

   Damage is one byte and is clamped here rather than refused: a number bigger
   than 255 is a hit no creature in this world can land, so the clamp is a
   formality - but it is the sender's bound, and the receiver draws exactly what
   arrives. Nothing is sent offline: a fight nobody can see is still a fight. */
export function netCombat(kind, a, b, c, ix) {
  if (Net.status !== "online") return false;
  if (!(kind >= 0 && kind <= 3)) return false;
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v || 0)));
  const i = ix == null ? 0xffff : Math.max(0, Math.min(0xffff, Math.round(ix)));
  const t = stampBytes();
  /* Kinds 0 and 1 name a tile in b/c, which can sit past z 255: its ninth bit
     rides at the very end, after the stamp. Kinds 2 and 3 carry no tile, so
     the bit is always nought for them and an old reader - which stops before
     the tail - sees exactly what it always did. */
  const zhi = (kind <= 1 ? zhiBit(c) : 0) & 1;
  const bc = kind <= 1 ? [byte(b), Math.max(0, Math.min(511, Math.round(c || 0))) & 0xff] : [byte(b), byte(c)];
  return raw(new Uint8Array([C_COMBAT, kind, byte(a), bc[0], bc[1], i & 0xff, (i >>> 8) & 0xff, t[0], t[1], t[2], t[3], zhi]));
}

/* The creatures this player can see, sent to the players around them
   (src/game.js#creatureStateBatch builds the list, #applyNpcStates reads the
   other end's). Nothing is sent offline, and nothing is sent when there is
   nobody to hear it - the caller checks that - but the packet is otherwise
   unconditional: a player alone in a field will never notice this exists.

   Repetition is the point, so it is bounded rather than forbidden: the batch
   goes out when it changes and otherwise every NPC_HEARTBEAT_MS, which is what
   lets a newcomer learn the creatures it can already see without waiting for one
   of them to move. The entries are compared as raw bytes, because that is
   exactly what the receiver will read. */
export function netNpcStates(list) {
  if (Net.status !== "online") return false;
  if (!list || !list.length) return false;
  const n = Math.min(NPC_BATCH, list.length);
  /* Each entry's ninth z bit rides after all the entries, one byte per entry:
     an old reader stops after its own entry run and never sees the tail. */
  const out = new Uint8Array(2 + n * NPC_ENTRY_BYTES + n);
  out[0] = C_NPC;
  out[1] = n;
  let at = 2, hi = 2 + n * NPC_ENTRY_BYTES;
  for (let i = 0; i < n; i++) {
    const e = list[i];
    const ix = Math.max(0, Math.min(0xffff, Math.round(e.ix || 0)));
    out[at++] = ix & 0xff;
    out[at++] = (ix >>> 8) & 0xff;
    out[at++] = Math.max(0, Math.min(255, Math.round(e.x || 0))) & 0xff;
    const fz = Math.max(0, Math.min(511, Math.round(e.z || 0)));
    out[at++] = fz & 0xff;
    out[at++] = Math.max(0, Math.min(100, Math.round(e.hp == null ? 100 : e.hp)));
    out[at++] = (e.engaged ? 1 : 0) | (e.dead ? 2 : 0) | (e.sheared ? 4 : 0);
    out[hi++] = zhiBit(fz);
  }
  let sig = "";
  for (let i = 2; i < out.length; i++) sig += out[i] + ",";
  if (sig === lastNpcSig && now() - lastNpcAt < NPC_HEARTBEAT_MS) return false;
  lastNpcSig = sig;
  lastNpcAt = now();
  if (!npcSentT0) npcSentT0 = now();
  npcSentN++;
  return raw(out);
}

/* A change to the shared world, told to the players around us (index.html's
   C_WORLD). The caller has already applied it locally - the click never waits
   on a round trip - so this is only the telling, and nothing goes out offline:
   a tree you cannot show anybody is still a tree you felled. `remain` is how
   many seconds the record has left to live (the rest of a respawn timer, or the
   rest of a fire's ninety); the server turns it into a deadline of its own. */
export function netLoc(x, z, bits, hp, remain) {
  if (Net.status !== "online") return false;
  const r = Math.max(0, Math.min(0xffff, Math.round(remain || 0)));
  /* Tiles past z 255 carry the ninth bit beside the low byte; the old shape
     (without it) is still read back, for a stale client's sake. */
  const fz = Math.max(0, Math.min(511, Math.round(z || 0)));
  return raw(new Uint8Array([C_WORLD, WK_LOC, x & 0xff, fz & 0xff, zhiBit(fz), bits & 0xff, hp & 0xff, r & 0xff, (r >>> 8) & 0xff]));
}

/* One pile of one item, as an *absolute* count rather than a delta: "three
   bones lie at (x, z)" and "none do" are the two things this can say, which is
   what keeps a re-applied record from doubling a pile. The id is validated here
   rather than trusted, because it is the one string on this channel and the
   server stores it verbatim. `base` is the pile's total *before* this change -
   the state the change was computed from - so a client that took from a
   different base can tell a same-tick race (same base: the lower id keeps the
   pile, see src/actions.js#trackGroundTake) from a take off a newer remainder.
   A re-sent record carries the base it was first computed from, never a fresh
   one: re-basing a record would rewrite the history a fight is judged on. */
export function netGround(x, z, id, qty, base) {
  if (Net.status !== "online") return false;
  const s = String(id || "").toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(s)) return false;
  const q = Math.max(0, Math.min(0x7fffffff, Math.round(qty || 0)));
  const bs = Math.max(0, Math.min(0x7fffffff, Math.round(base == null ? q : base)));
  const b = new TextEncoder().encode(s);
  const fz = Math.max(0, Math.min(511, Math.round(z || 0)));
  if (q <= 0xffff && bs <= 0xffff) {
    const out = new Uint8Array(10 + b.length);
    out[0] = C_WORLD; out[1] = WK_GROUND;
    out[2] = x & 0xff; out[3] = fz & 0xff; out[4] = zhiBit(fz);
    out[5] = q & 0xff; out[6] = (q >>> 8) & 0xff;
    out[7] = bs & 0xff; out[8] = (bs >>> 8) & 0xff;
    out[9] = b.length;
    out.set(b, 10);
    return raw(out);
  }
  const wide = fz > 255;
  const out = new Uint8Array((wide ? 14 : 13) + b.length);
  out[0] = C_WORLD; out[1] = wide ? WK_GROUND32W : WK_GROUND32;
  out[2] = x & 0xff; out[3] = fz & 0xff;
  let at = 4;
  if (wide) out[at++] = (fz >>> 8) & 1;
  out[at++] = q & 0xff; out[at++] = (q >>> 8) & 0xff; out[at++] = (q >>> 16) & 0xff; out[at++] = (q >>> 24) & 0xff;
  out[at++] = bs & 0xff; out[at++] = (bs >>> 8) & 0xff; out[at++] = (bs >>> 16) & 0xff; out[at++] = (bs >>> 24) & 0xff;
  out[at++] = b.length;
  out.set(b, at);
  return raw(out);
}

/* A shop's shelves, told to the players around us (index.html's WK_SHOP). The
   rows are the item ids the caller means and their *absolute* counts on the
   shelf, which is what makes a re-applied report safe; a count of nought is
   "that row is empty". `flags` is `SHOP_FULL` for the request a client makes
   when it opens a counter (rows then empty - the answer is the shop's whole
   shelf) and `SHOP_CLEAR` for the reset its own restock clock sends (see
   src/ui.js#applyShopStock). The name is the client's own shop key and is
   validated here because the server stores it. */
/* `flags` is `SHOP_FULL` for a request (no rows) and `SHOP_CLEAR` for the reset
   the restock clock sends (no rows); anything else is a change. Fails soft
   offline, so a shop in a world of one is exactly what it always was. */
export function netShop(name, flags, rows) {
  if (Net.status !== "online") return false;
  const s = String(name || "").toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(s)) return false;
  const nb = new TextEncoder().encode(s);
  const list = [];
  for (const r of (rows || []).slice(0, SHOP_ROWS_MAX)) {
    const id = String(r && r.id || "").toLowerCase();
    if (!/^[a-z0-9_]{1,24}$/.test(id)) continue;
    list.push([id, Math.max(0, Math.min(0xffff, Math.round(r.qty || 0)))]);
  }
  let n = 0;
  for (const r of list) n += 1 + r[0].length + 2;   /* idLen, id, qty16 */
  const out = new Uint8Array(2 + 1 + 1 + nb.length + 1 + 2 + n);
  let at = 0;
  out[at++] = C_WORLD;
  out[at++] = WK_SHOP;
  out[at++] = flags & 0xff;
  out[at++] = nb.length;
  out.set(nb, at); at += nb.length;
  out[at++] = list.length;
  out[at++] = 0; out[at++] = 0;      /* the restock clock is the server's */
  for (const [id, qty] of list) {
    const ib = new TextEncoder().encode(id);
    out[at++] = ib.length;
    out.set(ib, at); at += ib.length;
    out[at++] = qty & 0xff; out[at++] = (qty >>> 8) & 0xff;
  }
  return raw(out);
}

/* Ask the server for a shop's whole known shelf - what opening a counter sends,
   so the shelves a player is looking at are the world's and not their own
   guess. */
export function netShopRequest(name) { return netShop(name, SHOP_FULL, []); }

/* Say that a shop's shelves are back to their default (the restock clock ran
   out on this client) - the same thing the server's own prune does lazily when
   nobody is standing there to watch. */
export function netShopClear(name) { return netShop(name, SHOP_CLEAR, []); }

/* This connection's own id, as the server assigned it. It is what decides which
   of two players' copies of a creature is the one everybody follows
   (src/game.js#applyNpcStates): the handler in src/main.js hands it in, so the
   game side never has to know that there is a socket at all. -1 means the server
   has not named us yet, and then nothing remote is adopted. */
export function myConnectionId() { return myId; }

/* Stat Spy's answer: a short line of plain text back to the one connection that
   asked. The blob is whatever src/actions.js#statSpyText builds - the client
   prunes it to printable ASCII, because the other end is drawing it as chat. */
export function netStats(askerId, text) {
  if (Net.status !== "online") return false;
  const bytes = [];
  const s = String(text || "");
  for (let i = 0; i < s.length && bytes.length < 200; i++) {
    const c = s.charCodeAt(i);
    if (c >= 32 && c < 127) bytes.push(c);
  }
  if (!bytes.length) return false;
  const out = new Uint8Array(4 + bytes.length);
  out[0] = C_STATS;
  out[1] = askerId & 0xff;
  out[2] = (askerId >>> 8) & 0xff;
  out[3] = bytes.length;
  for (let i = 0; i < bytes.length; i++) out[4 + i] = bytes[i];
  return raw(out);
}

/* Our own connection id, or -1 before the server has said hello. The spell code
   needs it to tell "the cast I just made came back to me" from "somebody else
   cast at me", and to know whether an incoming spell is aimed at this client. */
export function netMyId() { return myId; }

/* ----------------------------------------------------------------- trades

   The wire form of an offer: a count, then one entry per stack (its item id as
   printable ASCII and its quantity as a u32). The same shape travels in both
   directions and is also what the server hands back when a trade completes, so
   both clients apply exactly the list the server arbitrated.

   Anything the browser hands us is cleaned rather than trusted: an id that is
   not [a-z0-9_] or a quantity that is not a positive integer is dropped instead
   of sent, because the server refuses such a packet anyway and a dropped item is
   a far better bug than a desynchronised trade. */
function encodeOffer(items) {
  const rows = [];
  for (const it of items || []) {
    if (!it || !it.id) continue;
    const id = String(it.id).toLowerCase();
    if (!/^[a-z0-9_]{1,24}$/.test(id)) continue;
    const qty = Math.max(1, Math.floor(it.qty || 1));
    rows.push([id, qty]);
    if (rows.length >= TRADE_SLOTS) break;
  }
  let size = 1;
  for (const [id] of rows) size += 1 + id.length + 4;
  const out = new Uint8Array(size);
  out[0] = rows.length;
  let at = 1;
  for (const [id, qty] of rows) {
    out[at++] = id.length;
    for (let i = 0; i < id.length; i++) out[at++] = id.charCodeAt(i) & 0xff;
    out[at++] = qty & 0xff;
    out[at++] = (qty >>> 8) & 0xff;
    out[at++] = (qty >>> 16) & 0xff;
    out[at++] = (qty >>> 24) & 0xff;
  }
  return out;
}

/* Decode a count-prefixed offer starting at `at`. Returns null for a malformed
   payload rather than throwing, because this parses bytes a peer sent: the
   server relays what it was given (bounded, but not re-encoded), so the
   receiving client is the last line of defence. */
function decodeOffer(bytes, at) {
  const count = bytes[at];
  if (count == null || count > TRADE_SLOTS) return null;
  let p = at + 1;
  const items = [];
  for (let i = 0; i < count; i++) {
    const len = bytes[p];
    if (len == null || len < 1 || len > TRADE_ID_MAX || p + 1 + len + 4 > bytes.length) return null;
    let id = "";
    for (let j = 0; j < len; j++) id += String.fromCharCode(bytes[p + 1 + j]);
    const q = p + 1 + len;
    items.push({ id, qty: (bytes[q] | (bytes[q + 1] << 8) | (bytes[q + 2] << 16) | (bytes[q + 3] << 24)) >>> 0 });
    p = q + 4;
  }
  return items;
}

/* Ask another player to trade. Their answer comes back as S_TRADE_OPEN (both
   windows open) or as an S_TRADE_INFO refusal. */
export function netTradeRequest(id) {
  return raw(new Uint8Array([C_TRADE_REQ, id & 0xff, (id >>> 8) & 0xff]));
}

/* Accept an invitation to trade, naming who sent it - a request is a
   notification and books nothing on the server, so this packet is what actually
   opens the pair. */
export function netTradeJoin(id) {
  return raw(new Uint8Array([C_TRADE_JOIN, id & 0xff, (id >>> 8) & 0xff]));
}

/* The one click that means "I agree to this stage": the server decides whether
   that is accepting the offer or confirming the swap. */
export function netTradeAccept() {
  return raw(new Uint8Array([C_TRADE_ACCEPT]));
}

/* Decline an invitation, or cancel a trade in progress - the server can tell
   which from whether it has a record for us. */
export function netTradeDecline(id) {
  return raw(new Uint8Array([C_TRADE_DECLINE, id & 0xff, (id >>> 8) & 0xff]));
}

/* Replace my whole offer with `items`. Sending the set rather than a diff means
   a lost packet cannot desynchronise the two windows - the next one repairs
   everything. */
export function netTradeOffer(items) {
  const body = encodeOffer(items);
  const out = new Uint8Array(body.length + 1);
  out[0] = C_TRADE_OFFER;
  out.set(body, 1);
  return raw(out);
}

/* How many free pack slots this side has - announced on open and whenever the
   pack changes mid-trade, so the partner's window can say so (src/trade.js). */
export function netTradeSlots(n) {
  return raw(new Uint8Array([C_TRADE_SLOTS, Math.max(0, Math.min(255, n | 0))]));
}

async function rpc(method, arg) {
  if (!socket || Net.status !== "online") throw new Error("Not connected to the world server.");
  return await socket.rpc[method](arg);
}

/* Where a named player in the world is standing, as `{x, z}` tiles - the client
   half of the server's `where` RPC (see index.html). It exists for `::tp
   <name>` (src/ui.js), which may be asked to teleport to a player the client
   cannot see: the Players Online tab lists the whole world, but a position only
   ever travels to the nine chunks around the player standing there, so the
   nearby ghost list and the online list are deliberately not the same set. This
   bridges the two, and answers null - never an exception - for anybody who is
   not in the world, or for a socket that is not up: the command's fallback text
   is a plain "not online", which is not worth a thrown error. */
export async function netWhere(name) {
  if (!name) return null;
  let reply;
  try {
    reply = await rpc("where", String(name).slice(0, NAME_MAX));
  } catch (err) {
    return null;
  }
  const parts = String(reply || "").trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const x = parseInt(parts[0], 10);
  const z = parseInt(parts[1], 10);
  if (!isFinite(x) || !isFinite(z)) return null;
  return { x, z };
}

/* The minigame record board (index.html's `board` table): the top twenty as
   [{name, ms, comp}] (comp = that runner's successful completions), or null
   when the socket is not up. Malformed rows are dropped, never trusted - the
   server stamps names from the login itself, but a board is still player data
   on its way to a modal. */
export async function netBoard() {
  let reply;
  try {
    reply = await rpc("board", "");
  } catch (err) {
    return null;
  }
  const out = [];
  for (const part of String(reply || "").split(",")) {
    const bits = part.trim().split(" ");
    if (bits.length !== 3) continue;
    const ms = parseInt(bits[1], 10);
    const comp = parseInt(bits[2], 10);
    if (!/^[A-Za-z0-9_]{3,12}$/.test(bits[0]) || !isFinite(ms) || ms <= 0) continue;
    if (!isFinite(comp) || comp < 1 || comp > 65535) continue;
    out.push({ name: bits[0], ms, comp });
  }
  return out;
}

/* Offer a finished run to the board: "denied" (a guest - no account to stamp
   the time with), "no" (too slow for the twenty), or "ok <rank> <wr>" (on
   the board; wr is 1 for the new world record). Null when the socket is not
   up - a run that never reaches the server still counts locally. */
export async function netSubmitBoard(ms) {
  try {
    return await rpc("submitBoard", String(Math.max(1, Math.round(ms))));
  } catch (err) {
    return null;
  }
}

/* -------------------------------------------------------------- accounts */

/* Who the account is belongs to the interface, and it changes in four places
   (register, login, logout, delete) plus a resumed login at boot. Rather than
   hoping the next roster publish happens to carry the news, every one of them
   says so. */
function notifyAccount() {
  fire(deps.onStatus, Net.status);
  fire(deps.onRoster, Net.rosterList || []);
}

function saveAuth(a) {
  auth = a;
  const store = typeof root !== "undefined" ? root.kv : null;
  if (!store) return;
  try {
    if (a) store[kvFolder].set("auth", a);
    else store[kvFolder].delete("auth");
  } catch (err) { /* remembering the login is a convenience, never required */ }
}

/* A remembered token means "log this player back in on the next visit" - the
   password itself is never stored anywhere. */
async function rememberAuth() {
  const store = typeof root !== "undefined" ? root.kv : null;
  if (!store) return null;
  try {
    const a = await store[kvFolder].get("auth");
    return a && a.name && a.token ? a : null;
  } catch (err) {
    return null;
  }
}

Net.register = async function (username, password) {
  const name = clean(username, 12);
  if (name.length < 3) return { ok: false, error: "A name needs at least 3 characters (letters, digits, _)." };
  if (password.length < 6) return { ok: false, error: "A password needs at least 6 characters." };
  try {
    const salt = randomHex(16);
    const token = await deriveToken(password, salt);
    const reply = await rpc("register", name + " " + token + " " + salt);
    if (reply === "taken") return { ok: false, error: "That name is already taken." };
    if (reply === "badname") return { ok: false, error: "Names are 3-12 letters, digits or underscores." };
    if (reply === "full") return { ok: false, error: "The world's account storage is full." };
    if (reply === "rate") return { ok: false, error: "Too many attempts - try again in a few minutes." };
    if (reply !== "ok") return { ok: false, error: "Could not create the account (" + reply + ")." };
    saveAuth({ name, token, salt });
    Net.account = name;
    /* registering adopts the character being played, and the account's name is
       now the character's name too */
    setCharacterName(name);
    sendJoin(true);
    notifyAccount();
    return { ok: true, name };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
};

Net.login = async function (username, password) {
  const name = clean(username, 12);
  try {
    let token;
    if (!password && auth && auth.name === name) {
      token = auth.token;                       /* the remembered session */
    } else {
      const salt = await rpc("salt", name);
      if (!salt) return { ok: false, error: "No account called " + name + "." };
      token = await deriveToken(password, salt);
    }
    const reply = await rpc("login", name + " " + token);
    if (reply === "noaccount") return { ok: false, error: "No account called " + name + "." };
    if (reply === "rate") return { ok: false, error: "Too many attempts - try again in a few minutes." };
    if (reply !== "ok") return { ok: false, error: "Wrong password." };
    const salt = await rpc("salt", name);
    saveAuth({ name, token, salt });
    const blob = await rpc("load", name + " " + token);
    Net.account = name;
    notifyAccount();
    let loaded = false;
    if (blob) {
      try {
        loaded = deps.applyState(JSON.parse(blob));
      } catch (err) {
        loaded = false;
      }
    }
    /* the loaded character is the account's, so it is named after the account -
       after applyState, which writes the name out of the save's own blob */
    setCharacterName(name);
    sendJoin(true);
    sendState(true);
    return { ok: true, name, loaded };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
};

Net.logout = function () {
  if (Net.status === "online") {
    try {
      const p = rpc("logout", "");
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  saveAuth(null);
  Net.account = null;
  lastKitSig = "";
  sendJoin(true);
  sendState(true);
  notifyAccount();
};

/* Leaving the world without leaving the socket (index.html#C_LEAVE): the
   logout tab's goodbye. The peer is dropped everywhere at once - off the map,
   off the roster, out of the count, out of any trade - while the socket stays
   up so the login screen behind keeps its live "N online". Coming back is the
   ordinary re-entry: netTick's edge re-sends move+join+state the first tick
   back in the world. */
Net.leaveWorld = function () {
  raw(new Uint8Array([C_LEAVE]));
  fire(deps.trade && deps.trade.onLost);
};

/* Reopen the socket after it was deliberately stopped (a moderator boot above,
   or netClose): pressing Play is what earns a player their presence back. */
Net.reconnect = function () {
  if (Net.status === "online" || Net.status === "connecting") return;
  stopped = false;
  attempt = 0;
  open();
};

/* The moderator's boot command (index.html#kickall): the server checks the
   caller is really the moderator, so this answers "denied" for anyone else. */
Net.kickAll = async function () {
  return await rpc("kickall", "");
};

/* Crowning (index.html#claim): makes the currently-logged-in account the
   moderator, using the owner's secret. One call, one reply. */
Net.claimMod = async function (secret) {
  return await rpc("claim", String(secret));
};

Net.wipeAccounts = async function (secret) {
  return await rpc("wipe", String(secret));
};

Net.deleteAccount = async function () {
  if (!auth) return { ok: false, error: "Not logged in." };
  try {
    const reply = await rpc("destroy", auth.name + " " + auth.token);
    if (reply !== "ok") return { ok: false, error: "Could not delete the account (" + reply + ")." };
    try {
      const p = rpc("logout", "");
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
    saveAuth(null);
    Net.account = null;
    notifyAccount();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
};

/* Push the whole character to the account. Silent and cheap enough for the
   autosave clock (src/save.js): the blob is the same JSON the local save
   writes, trimmed of trailing empty inventory and bank slots. */
Net.saveCharacter = async function (blob) {
  if (!auth) return { ok: false, error: "no account" };
  try {
    const reply = await rpc("save", auth.name + " " + auth.token + " " + blob);
    if (reply === "ok") return { ok: true };
    return { ok: false, error: reply };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
};

/* Log back in from the remembered token, if there is one. Called once at boot;
   a guest simply has no remembered token and nothing happens.

   It has to WAIT for the socket: the call site is the end of boot, which is a
   moment when the connection is still being opened, and an RPC on a socket that
   is not open yet throws - so a returning player would silently never be logged
   back in, every single time. */
Net.resume = async function () {
  const a = await rememberAuth();
  if (!a) return false;
  for (let i = 0; i < 40 && !stopped && Net.status !== "online"; i++) {
    await new Promise((r) => setTimeout(r, 150));
  }
  if (Net.status !== "online") return false;
  auth = a;
  try {
    const reply = await rpc("login", a.name + " " + a.token);
    if (reply !== "ok") {
      saveAuth(null);
      return false;
    }
    Net.account = a.name;
    notifyAccount();
    const blob = await rpc("load", a.name + " " + a.token);
    if (blob) {
      try { deps.applyState(JSON.parse(blob)); } catch (err) { /* keep the local save */ }
    }
    setCharacterName(a.name);
    sendJoin(true);
    sendState(true);
    return true;
  } catch (err) {
    return false;
  }
};

/* ------------------------------------------------------------------- clock */

/* Called from the game's own tick (src/main.js), so presence travels at the
   game's tick rate and never on a timer of its own. */
export function netTick() {
  if (Net.status !== "online" || !game || !game.player) return;
  /* Nothing at all goes out until the welcome screen has been left, and the
     tick the player finally walks in is the tick everything goes out: the chunk
     (or the server never subscribes them to a neighbourhood), the join (or they
     are on no roster) and the state (or nobody can see them). See `canSend`. */
  if (!inWorld()) { wasInWorld = false; return; }
  const entered = !wasInWorld;
  wasInWorld = true;
  sendMove(entered);
  sendJoin(entered);
  sendState(entered);
  /* The work pose rides the same tick but takes no `force`: unlike position it
     is not something the server (or the world) holds, it is a state the people
     around us draw, so the change check and the heartbeat are the whole of the
     contract and a player who is doing nothing sends nothing at all. */
  sendAction();
}

/* The socket's own beat (BEAT_MS above). It is what keeps a backgrounded
   player in the world: the game's render loop is stopped while the tab is
   hidden, so without this the player would go quiet and everybody else would
   lose their body. Move/join stay rate-limited by their change checks, and the
   16-byte state packet is cheap enough to just send - so a visible tab pays
   nothing for it. */
let beat = null;
function startBeat() {
  if (beat) return;
  beat = setInterval(netTick, BEAT_MS);
}

/* Leaving and returning to the tab is worth a packet each way: hiding it tells
   the world exactly where the player is standing - and that they are *away* -
   just before the browser starts slowing the timers down, and coming back says
   so at once rather than on the next beat.

   This handler is the load-bearing part of the whole mechanism (see STATE_AWAY):
   it fires while the tab still has its full complement of timer budget, before
   the throttling and freezing that a hidden tab is subject to, so the packet it
   forces out is the one packet that can be relied upon to arrive. Everything
   after it is best-effort - the beat will keep saying the same thing for as long
   as the browser lets it, and the people looking at us do not need any of it. */
function watchVisibility() {
  document.addEventListener("visibilitychange", () => {
    /* the flag first, and before the early return: a client still sitting on the
       welcome screen has no presence to correct, but the first packet it does
       send has to carry the right bit, and that may be a minute from now */
    away = !!document.hidden;
    if (!canSend()) return;
    sendMove(true);
    sendJoin(true);
    sendState(true);
  });
}

/* Called from the game's frame hook: drops the ghosts of players nobody has
   spoken about in a while. */
/* How often position goes out while moving: the 600 ms tick is what a ghost
   reacts to, so tick-only sending caps every other player a full step behind.
   10 Hz is 160 bytes a second and the server allows 48 - nothing to either end. */
const STATE_FAST_MS = 100;
let lastFastAt = 0;

export function netFrame() {
  drainDelayed();
  /* A pose change goes out on the frame it starts, not on the next 600 ms
     tick: the shortest agility poses (the ledge walks, 0.28 s) live and die
     between two ticks, so tick-only sending meant other screens never saw
     them at all - a crossing that read as a glide. The change check inside
     sendAction makes this free when the pose is steady. */
  if (Net.status === "online" && peers.size) sendAction();
  /* ...and position goes out ten times a second while moving, for the same
     reason: a ghost can only be as fresh as the last packet. Idle players say
     nothing here - the tick covers them - and neither does a player nobody can
     see, since there is nobody to be fresh for. */
  if (Net.status === "online" && peers.size && game && game.player && game.player.moving) {
    const t = now();
    if (t - lastFastAt >= STATE_FAST_MS) { lastFastAt = t; sendState(false); }
  }
  if (Net.status !== "online" || !peers.size) return;
  if (now() - ghostSweepAt < 1000) return;
  ghostSweepAt = now();
  const cutoff = now() - GHOST_TIMEOUT_MS;
  for (const [id, peer] of peers) {
    if (peer.seenAt > cutoff) continue;
    /* ...unless the peer told us it was away: a player who has switched tabs
       cannot send anything, so silence from them is not the thing this timeout
       is for. Their body is kept until their socket closes, which is what
       actually means they have gone - the server says S_LEAVE then and the ghost
       is dropped above, long before this sweep matters. (Before this line, the
       timeout did exactly what it was told and removed a player who had simply
       been reading another tab for seventy-five seconds: the user's report.) */
    if (peer.away) continue;
    peers.delete(id);
    removeGhost(id);
  }
}

export function initNet(g, d) {
  game = g;
  deps = d;
  if (typeof d.inWorld === "function") inWorld = d.inWorld;
  wasInWorld = false;
  stopped = false;
  attempt = 0;
  startBeat();
  watchVisibility();
  open();
}

export { Net };
