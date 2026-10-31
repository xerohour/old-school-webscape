/* -------------------------------------------------------------------- trade

   The trade window, and everything that leads to it: the "Trade with" entry the
   right-click menu on another player offers (src/actions.js#playerMenuBlock
   calls in here through `Actions.playerOptions`), the request the other player
   answers, and the two interfaces the pair then share - the offer window and the
   confirmation screen. The offer window is already a gameframe window
   (FullIface "trade", keepWorld) - that needed no change.

    ## The two windows wear the game frame, not a custom one

    The offer window and the confirmation screen sit in the game riveted
    window - plateBacking plus BANK_PARTS at BANK_WIN with the close button
    hover sprite, exactly the bank and shop recipe (src/ui.js#renderBank).
    Inside it the layout follows interfaces 335/334 from cache revision 241:
    offer grids, name plate, Accept/Decline on bare black plates that lighten
    on hover with brightening labels, one 1px divider, a borderless status
    line whose wait is centred with its dots, and the red Trade modified
    flash. The offer headers read You offer and <name> offers per the user
    own screenshot, and the value lines are left out - no Grand Exchange
    prices exist here to fill them.
   Three things the tables cannot carry are built here at runtime, because the
   client builds them at runtime too:

     * **The offer grids.** The cache's interface holds only an empty container
       where the items go (components 48/49 on the left, 50/51 on the right); the
       client creates the item widgets in code. The container's own box is the
       authority for the grid that fills it, and it fits four columns of 42 and
       six rows of 36 - the pitch every other item grid in this world uses, and
       the same pitch as the inventory (src/style.css#.invGrid).
     * **The names.** "Trading With: Unknown" and the plate under it carry the
       opponent's name, which the server sends when the window opens.
     * **The status line** under the buttons ("Waiting for other player" in the
       cache) says what the pair are actually waiting for.

   ## The offer is escrowed, and that is a deliberate rule

   Offering an item takes it out of the pack, exactly as the client's offer does.
   The real game can afford that because the items live on the server; here the
   save is the browser's, so an offered stack is also written into the save (see
   escrowIntoRows and src/save.js#setInvEscrow) - a player who closes the tab
   mid-trade finds their items back in the pack instead of a hole where they
   were. Every ending that is not a completed trade hands the escrow back.

   ## What each side trusts the other for

   Offers are relayed by the server, which bounds them and decides when the pair
   has agreed, but it does not know what an item is - so the swap itself is
   applied here, from the list the server handed back at the end. A modified
   client could therefore receive more than it gave. That is the same trust the
   account system already extends (a character blob is whatever the client
   saves), and closing it would mean the server owning every item in the world.
   It is a known deviation, written down in src/README.md.
*/

import { itemDef, itemName, isStackable, showsCount, MAX_STACK } from "./items.js";
import { invAdd, invFree } from "./player.js";
import { amountString } from "./util.js";
import { setInvEscrow } from "./save.js";
import {
  netTradeRequest, netTradeJoin, netTradeAccept, netTradeDecline, netTradeOffer, netTradeSlots,
  TRADE_END, TRADE_INFO, Net,
} from "./net.js";
import { Actions, cancelAction, spawnGround, playerMenuName } from "./actions.js";
import Frame from "./gameframe.js";
import {
  kit, FullIface, UI, chat, mark, showHoverTip, hideHoverTip,
  openCtx, rightMenu, itemRows, openAmountPrompt,
  plateBacking, BANK_PARTS, CLOSE_BTN, IFACE_TEXT_STYLE,
} from "./ui.js";

const { mk, place, pxSprite, pxTiled, pxText, pxRich, pxRect, pxFrame, pxHit, itemIcon, hoverHTML } = kit;

/* Where the interface is drawn: the root widget of both interfaces is the
   488x305 body at (17,25), and the frame's decoration hangs outside it. */
const ROOT = { x: 12, y: 20, w: 488, h: 305 };

/* How many stacks one offer holds (the server's own cap, src/net.js#TRADE_SLOTS),
   and how long a sent request - or a received invitation - is left standing
   before it is forgotten. */
const TRADE_SLOTS = 24;
const REQUEST_MS = 30000;
/* How long the "Trade modified" flash stands after the change that raised it. */
const TRADE_FLASH_MS = 6000;

/* The offer grid: the cache's container box, filled with the pitch the client's
   item widgets use - 32px art plus 10 across, 32px art plus 4 down. Four across
   and six down fit the 185x223 container with the same slack the inventory
   leaves inside its own box. */
const OFFER = {
  left: { x: 16, y: 60 },
  right: { x: 310, y: 60 },
  cols: 4,
  rows: 6,
  stepX: 38,
  stepY: 36,
};

/* The confirmation screen's item columns: the cache's own text boxes sit at
   (19,89) and (137,89) on the left, (260,89) and (377,89) on the right, each
   117x14, and the client fills them with one item per row. */
const CONFIRM_COLS = [8, 124, 245, 361];
const CONFIRM_ROWS = 14;
const CONFIRM_ROW_H = 14;

/* ------------------------------------------------------------------ tables

   One entry per cache component, in the interface's own draw order.

     ["box", x, y, w, h, colour, alpha]   widget type 3; the cache stores alpha
                                          *inverted*, so 0 here is opaque and 56
                                          is the 22% the two red panels use
     ["spr", name, x, y]                  widget type 5 at its native size
     ["tiled", name, x, y, w, h]          widget type 5 with the format's own
                                          tile flag - repeated by the art's own
                                          size, because these are 32x7 slivers
                                          inside a 32x32 cell and cell-tiling
                                          would leave the box all but empty
     ["text", str, ...] / ["rich", ...]   widget type 4 (rich parses <br>/<col=>)
     ["btn", str, x, y, w, h, colour, key]  an action label with its own hit box
     ["dyn", key]                         a component the client fills at runtime
*/

/* The frame is the game frame itself - the bank and shop recipe, not a
   custom one: plateBacking plus BANK_PARTS (dialog tiles, rivet corners,
   iron rivet rows and edge rivets) with the window sitting at BANK_WIN, and
   the close button swapping in its hover sprite like every game window.
   No trade sprite survives. Content carries no borders of its own except
   single black plates, one 1px divider, and the transient red flash. */

const TRADE_335 = [
  ["dyn", "title"],
  /* Bare black plates first; their riveted rings and connectors follow the grids. */
  ["dyn", "name"],
  ["box", 218, 170, 64, 30, "#000000", 0],
  ["box", 218, 240, 64, 30, "#000000", 0],
  ["dyn", "gridMine"],
  ["dyn", "gridTheirs"],
  ["dyn", "offerTitles"],
  ["tiled", "rivetEdgeTop", 212, 234, 76, 6],
  ["tiled", "ironRivetsHorizontal", 212, 260, 76, 6],
  ["tiled", "ironRivetsVertical", 212, 234, 6, 42],
  ["tiled", "rivetEdgeRight", 282, 234, 6, 42],
  ["spr", "rivetCornerTopLeft", 212, 234],
  ["spr", "rivetCornerTopRight", 263, 234],
  ["spr", "rivetCornerBottomLeft", 212, 246],
  ["spr", "rivetCornerBottomRight", 263, 246],
  ["btn", "Accept", 218, 170, 64, 30, "#00c000", "accept"],
  ["btn", "Decline", 218, 240, 64, 30, "#c00000", "decline"],
  ["dyn", "status"],
  ["dyn", "statusDots"],
];

const TRADE_334 = [
  /* Tall top container for the question plus warning, then the divider and
     one ring per bottom button. Same 6px kit throughout. */
  ["tiled", "dialogBack", 18, 30, 476, 24],
  ["box", 180, 290, 65, 25, "#0f0105", 0],
  ["box", 257, 290, 67, 24, "#0f0105", 0],
  ["dyn", "confirmLists"],
  ["text", "You are about to give:", 18, 72, 229, 13, { font: "bold12", color: "#ffff00", align: 1, valign: 1 }],
  ["text", "In return you will receive:", 255, 72, 229, 13, { font: "bold12", color: "#ffff00", align: 1, valign: 1 }],
  ["dyn", "confirmQ"],
  ["dyn", "confirmDots"],
  ["rich", "There is <col=ff0000>NO WAY<col=ffffff> to reverse a trade if you change your mind.", 11, 43, 490, 11, { font: "plain11", color: "#ffffff", align: 1, valign: 1 }],
  ["btn", "Accept", 180, 290, 65, 25, "#00c000", "accept"],
  ["btn", "Decline", 257, 290, 67, 24, "#c00000", "decline"],
  ["dyn", "tradingWith"],
  ["dyn", "modified"],
];

/* ------------------------------------------------------------------- state */

export const Trade = {
  /* null when no window is up; {id, name} of the other player when one is */
  partner: null,
  /* 0 = offers, 1 = the confirmation screen */
  stage: 0,
  /* what each side has put up: [{id, qty}] */
  myOffer: [],
  theirOffer: [],
  /* my own agreement (for the status line) and theirs (from the server) */
  accepted: false,
  theirAccepted: false,
  /* the partner's free pack slots, announced over the socket (51/52) on open
     and whenever either pack changes - what the name plate reads aloud */
  theirSlots: null,
  /* "Trade modified" is a transient flash on the confirmation screen, on the
     side whose offer changed under an agreement already given. It lasts a few
     seconds (TRADE_FLASH_MS) then clears - the second screen is normally not
     red at all. 'mine' = my change, 'theirs' = theirs, with the moment it was
     raised; null when no flash is standing. */
  modifiedSide: null,
  modifiedAt: 0,
  /* the blink phase for the modified caption above */
  _blinkOn: true,
  _blinkAt: 0,
  /* an invitation that has arrived and not been answered, and a request this
     side has sent and is still waiting on */
  invited: null,
  pending: null,
  /* The escrow: every stack taken out of the pack for the current offer, with
     the slot, id and quantity needed to put it back. */
  escrow: [],
};

/* The window's own chat lines go through the trade colour (src/style.css#.trade),
   the client's purple for exactly these messages. */
const say = (msg) => chat(msg, "trade");

/* ---------------------------------------------------------------- escrow */

/* The save-side half of the escrow: the inventory rows about to be written are
   handed over so the offered stacks can be put back into them - merged where the
   item stacks, into a vacated slot where it does not. So a reload (or the tab
   closing) after an autosave finds the items in the pack, which is what the real
   game's server-side inventory gives it for free. */
function escrowIntoRows(rows) {
  if (!Trade.escrow.length) return rows;
  const out = rows.slice();
  for (const e of Trade.escrow) {
    if (isStackable(e.id)) {
      const at = out.findIndex((r) => r && r.id === e.id && !r.note);
      if (at >= 0) { out[at] = { id: out[at].id, qty: out[at].qty + e.qty }; continue; }
    }
    /* the slot it came from first, then any free one */
    let at = out[e.slot] ? -1 : e.slot;
    if (at < 0) at = out.indexOf(null);
    if (at < 0) continue;                 /* nowhere to put it; the pack is full */
    out[at] = { id: e.id, qty: e.qty };
  }
  return out;
}

/* Give the escrow back to the pack. Every ending except a completed trade. */
function returnEscrow() {
  const ps = UI.ps;
  if (ps) for (const e of Trade.escrow) invAdd(ps, e.id, e.qty);
  Trade.escrow.length = 0;
  mark("inv");
}

/* -------------------------------------------------------- offer changes */

function refresh() {
  tradeRefresh();
}

/* The window redrawn without the flicker: every packet used to rebuild the
   whole DOM (FullIface.refresh wipes innerHTML), so the static title and name
   flashed on each offer. Each dynamic region now owns a box, created once per
   window, and a refresh only clears and refills the boxes - the title and the
   frame are never touched. A new stage or a new partner still rebuilds fully. */
let tradeWin = null, tradeBuiltStage = -1, tradeBuiltFor = null;
const tradeDyn = {};

function tradeRefresh() {
  if (!Trade.partner || FullIface.open !== "trade") return;
  const name = Trade.partner.name;
  if (!tradeWin || !tradeWin.isConnected || tradeBuiltStage !== Trade.stage || tradeBuiltFor !== name) {
    FullIface.refresh();
    return;
  }
  const ox = -ROOT.x, oy = -ROOT.y;
  for (const key of Object.keys(tradeDyn)) {
    const box = tradeDyn[key];
    if (!box || !box.isConnected) continue;
    box.innerHTML = "";
    drawDynamic(box, key, ox, oy, name);
  }
}

/* Put `qty` of the item in inventory slot `index` up for trade. The stack leaves
   the pack, so the offer and the pack can never both hold it. */
export function offerItem(index, qty) {
  const ps = UI.ps;
  if (!Trade.partner || Trade.stage !== 0) return false;
  const stack = ps.inv[index];
  if (!stack) return false;
  const n = Math.max(1, Math.min(stack.qty, Math.floor(qty || stack.qty)));
  const already = Trade.myOffer.find((o) => o.id === stack.id);
  if (isStackable(stack.id)) {
    if (!already && Trade.myOffer.length >= TRADE_SLOTS) {
      say("You can only offer " + TRADE_SLOTS + " different items at a time.");
      return true;
    }
  } else if (Trade.myOffer.length >= TRADE_SLOTS) {
    say("You can only offer " + TRADE_SLOTS + " different items at a time.");
    return true;
  }
  stack.qty -= n;
  if (stack.qty <= 0) ps.inv[index] = null;
  /* Non-stackables never merge: each inventory slot stays its own offer row,
     so 20 separate leathers show as 20 separate offer slots (user report
     2026-10-27 - merged rows displayed one stacked slot for unstacked goods).
     Stackables keep the single-row merge. */
  if (isStackable(stack.id)) {
    if (already) already.qty += n;
    else Trade.myOffer.push({ id: stack.id, qty: n });
  } else {
    for (let k = 0; k < n; k++) {
      if (Trade.myOffer.length >= TRADE_SLOTS) {
        say("You can only offer " + TRADE_SLOTS + " different items at a time.");
        break;
      }
      Trade.myOffer.push({ id: stack.id, qty: 1 });
    }
  }
  Trade.escrow.push({ slot: index, id: stack.id, qty: n });
  sendOffer();
  sendSlots();
  mark("inv");
  refresh();
  return true;
}

/* Take an offered stack back out of the window, into the pack. */
function withdrawOffer(i) {
  const row = Trade.myOffer[i];
  if (!row) return;
  withdrawQty(i, row.qty);
}

/* Take `n` of one offered row back into the pack - the right-click Remove rows
   below. The escrow rows of that item are unwound from the newest, so the
   oldest escrow (with the original slot) is what survives a partial removal. */
function withdrawQty(i, n) {
  const ps = UI.ps;
  const row = Trade.myOffer[i];
  if (!row || !ps || Trade.stage !== 0) return;
  let left = Math.max(1, Math.min(row.qty, Math.floor(n) || row.qty));
  row.qty -= left;
  for (let k = Trade.escrow.length - 1; k >= 0 && left > 0; k--) {
    const e = Trade.escrow[k];
    if (e.id !== row.id) continue;
    const take = Math.min(e.qty, left);
    invAdd(ps, e.id, take);
    e.qty -= take;
    left -= take;
    if (e.qty <= 0) Trade.escrow.splice(k, 1);
  }
  if (row.qty <= 0) Trade.myOffer.splice(i, 1);
  sendOffer();
  sendSlots();
  mark("inv");
  refresh();
}

/* The right-click menu on your own side of the offer window: take back one, an
   amount, or the lot - the wiki's own Remove rows. The other side's items stay
   inert. */
function removeMenu(i, row) {
  const out = [{ label: "Remove", fn: () => withdrawQty(i, 1) }];
  if (row.qty > 1) {
    out.push({ label: "Remove-5", fn: () => withdrawQty(i, 5) });
    out.push({ label: "Remove-10", fn: () => withdrawQty(i, 10) });
    out.push({ label: "Remove-X", fn: () => openAmountPrompt("remove", i) });
  }
  out.push({ label: "Remove-All", fn: () => withdrawQty(i, row.qty) });
  out.push({ label: "Cancel", fn: () => {} });
  return out;
}

/* Tell the partner how many free pack slots this side has, for their window's
   name plate. Sent on open and after every offer change, which are the only
   moments this side's pack can change mid-trade. */
function sendSlots() {
  const ps = UI.ps;
  if (!Trade.partner || !ps || !ps.inv) return;
  netTradeSlots(invFree(ps));
}

function onSlots(n) {
  if (!Trade.partner) return;
  Trade.theirSlots = n & 0xff;
  refresh();
}

/* A lost agreement raises the flash on the side that changed it, if the flash
   is not already standing from an even newer change. The first offer a window
   ever sends voids nothing, so it raises nothing. */
function raiseFlash(side) {
  Trade.modifiedSide = side;
  Trade.modifiedAt = Date.now();
}

/* True while a flash is standing. Expiry is lazy: tickTrade clears it. */
function flashFresh() {
  return !!Trade.modifiedSide && Date.now() - Trade.modifiedAt < TRADE_FLASH_MS;
}

function sendOffer() {
  /* The window's own agreement, and the caption that belongs to losing it. An
     offer that changes voids *both* accepts on the server (index.html's
     offerChanged), so this side has to end up looking like the other one does -
     its own Accept is forgotten here too, or it would sit on "Waiting for other
     player" for an agreement it no longer has. */
  if (Trade.accepted || Trade.theirAccepted) raiseFlash("mine");
  Trade.accepted = false;
  netTradeOffer(Trade.myOffer);
}

/* --------------------------------------------------------------- lifecycle */

function beginTrade(id, name) {
  Trade.partner = { id, name };
  Trade.stage = 0;
  Trade.myOffer = [];
  Trade.theirOffer = [];
  Trade.accepted = false;
  Trade.theirAccepted = false;
  Trade.theirSlots = null;
  Trade.modifiedSide = null;
  Trade.modifiedAt = 0;
  Trade._blinkOn = true;
  Trade._blinkAt = Date.now();
  Trade._dots = 1;
  Trade._dotsAt = 0;
  Trade.escrow = [];
  Trade.pending = null;
  clearInvite();
  /* A trade is a conversation: it ends a follow and any activity in progress,
     exactly as clicking a person does (src/actions.js#begin). */
  cancelAction();
  FullIface.show("trade", renderTrade, { keepWorld: true });
  sendSlots();
}

function endTrade(restore) {
  if (!Trade.partner) return;
  if (restore) returnEscrow();
  Trade.partner = null;
  Trade.myOffer = [];
  Trade.theirOffer = [];
  Trade.escrow = [];
  Trade.accepted = false;
  Trade.theirAccepted = false;
  Trade.theirSlots = null;
  Trade.stage = 0;
  Trade.modifiedSide = null;
  Trade.modifiedAt = 0;
  Trade._blinkOn = true;
  tradeWin = null;
  if (FullIface.open === "trade") FullIface.hide();
}

/* Does the pack have room for everything the other side is offering? The client
   refuses the confirmation with the message below rather than spilling loot on
   the floor, and so does this. Nothing is mutated: the room left in the stacks
   already in the pack, and in the stacks the offer would create, is tallied
   separately. */
function hasRoomFor(items) {
  const ps = UI.ps;
  let free = invFree(ps);
  const rows = [];
  for (const s of ps.inv) if (s && !s.note) rows.push({ id: s.id, room: MAX_STACK - s.qty });
  for (const it of items) {
    if (!isStackable(it.id)) { free -= it.qty; if (free < 0) return false; continue; }
    let left = it.qty;
    for (const r of rows) {
      if (!left || r.id !== it.id || r.room <= 0) continue;
      const take = Math.min(r.room, left);
      r.room -= take;
      left -= take;
    }
    while (left > 0) { free--; left -= MAX_STACK; }
    if (free < 0) return false;
  }
  return true;
}

function applyLoot(items) {
  const ps = UI.ps;
  for (const it of items) {
    const added = invAdd(ps, it.id, it.qty);
    if (added < it.qty) {
      /* With the pre-check this cannot happen; if it ever does, the surplus goes
         on the floor at the player's feet rather than nowhere. */
      const p = UI.game.player;
      spawnGround(it.id, it.qty - added, Math.floor(p.x), Math.floor(p.z));
    }
  }
  mark("inv");
}

/* ---------------------------------------------------------- net callbacks */

function onRequest(id, name) {
  if (!name || Trade.partner) return;
  /* Mutual: my own request to them is still standing, so theirs completes it -
     straight into the trade screen with no second line and no second click. */
  const p = Trade.pending;
  if (p && p.id === id && Date.now() - p.at <= REQUEST_MS && namesMatch(p.name, name)) {
    netTradeJoin(id);
    return;
  }
  /* A second invitation while one stands replaces it - the old line is dead
     (its handlers check identity below) and its timer is dropped. */
  clearInvite();
  const inv = { id, name, timer: 0 };
  Trade.invited = inv;
  inv.timer = setTimeout(() => { if (Trade.invited === inv) Trade.invited = null; }, REQUEST_MS);
  /* The invitation is answered from the chatbox line itself, the way the
     client answers from its own trade tab - which this world does not have.
     A left click on the line accepts; a right click offers Accept trade and
     Cancel. No modal box goes up at all. */
  chat(name + " wishes to trade with you.", "trade", null, null, {
    tag: "trade:" + id,
    menuTitle: name,
    onClick: () => acceptInvite(inv),
    menuOptions: [
      { label: "Accept trade", fn: () => acceptInvite(inv) },
      { label: "Cancel", fn: () => declineInvite(inv) },
    ],
  });
}

/* Take an invitation that is still standing: anything else - an expired or
   replaced line, a trade already opened - is a no-op. */
function acceptInvite(inv) {
  if (!inv || Trade.invited !== inv) return;
  clearInvite();
  netTradeJoin(inv.id);
}

function declineInvite(inv) {
  if (!inv || Trade.invited !== inv) return;
  clearInvite();
  netTradeDecline(inv.id);
}

/* Drop whatever invitation is standing, stopping its expiry timer. */
function clearInvite() {
  const inv = Trade.invited;
  Trade.invited = null;
  if (inv && inv.timer) clearTimeout(inv.timer);
}

function onOpen(id, name) {
  if (!name) return;
  Trade.pending = null;
  beginTrade(id, name);
}

function onOffer(items) {
  if (!Trade.partner) return;
  Trade.theirOffer = items;
  /* The same rule from the other side: their change voids the agreement this
     side had given, so Accept goes live again. The flash is raised here rather
     than left to the status packet that follows, because the packet can only say
     that *they* withdrew, never that this side's own click was thrown away. */
  if (Trade.accepted) raiseFlash("theirs");
  Trade.accepted = false;
  refresh();
}

function onStatus(bit) {
  if (!Trade.partner) return;
  Trade.theirAccepted = !!bit;
  if (Trade.theirAccepted) { Trade._dots = 1; Trade._dotsAt = Date.now(); }
  refresh();
}

function onStage(stage) {
  if (!Trade.partner) return;
  /* A fresh flash survives the trip into the confirmation screen, which may be
     reached just after the change that raised it; an old one stays dead.
     Either way both accepts clear, which is the fresh agreement. */
  Trade.stage = stage;
  Trade.accepted = false;
  Trade.theirAccepted = false;
  if (stage === 1) { Trade._blinkOn = true; Trade._blinkAt = Date.now(); }
  refresh();
}

function onEnd(reason, items) {
  if (!Trade.partner) return;
  if (reason === TRADE_END.DONE) {
    /* The items left the pack when they were offered, so the swap is one-sided
       from here: hand over what the server said the other side put up, and drop
       the escrow - it belongs to them now. */
    Trade.escrow.length = 0;
    applyLoot(items || []);
    say("Accepted trade.");
    endTrade(false);
    return;
  }
  if (reason === TRADE_END.DECLINED) say("Trade declined.");
  else if (reason === TRADE_END.OTHER_DECLINED) say("Other player declined the trade.");
  else if (reason === TRADE_END.GONE) say("Other player has left the trade.");
  else say("The trade was cancelled.");
  endTrade(true);
}

function onInfo(code) {
  if (code === TRADE_INFO.BUSY) say("That player is already trading.");
  else if (code === TRADE_INFO.GONE) say("That player is no longer online.");
  else if (code === TRADE_INFO.FAR) say("You are too far away to trade with that player.");
  else if (code === TRADE_INFO.SELF) say("You can't trade with yourself.");
  else if (code === TRADE_INFO.REJECTED) say("That player declined your trade request.");
  Trade.pending = null;
}

/* The socket - or the server's own memory of the world - went away: a window
   that cannot be completed closes, and the escrow goes back before the player
   can believe otherwise. */
function onLost() {
  Trade.pending = null;
  clearInvite();
  if (!Trade.partner) return;
  say("The trade was cancelled.");
  endTrade(true);
}

/* ------------------------------------------------------------- the request */

/* Ask `ghost` to trade - the menu entry installed through Actions.playerOptions. */
export function request(ghost) {
  if (!ghost || ghost.kind !== "ghost") return;
  if (Trade.partner) return;
  if (Net.status !== "online") { say("You need to be connected to the world to trade."); return; }
  /* Their request is still standing: answer it instead of sending a new one -
     a live invitation from this player opens straight into the trade screen. */
  const inv = Trade.invited;
  if (inv && inv.id === ghost.id && namesMatch(inv.name, ghost.name)) {
    acceptInvite(inv);
    return;
  }
  Trade.pending = { id: ghost.id, name: ghost.name || "Player", at: Date.now() };
  netTradeRequest(ghost.id);
  say("Sending trade offer...");
}

/* Same player by id with the name as backstop (entity ids are reused after a
   logout, and the request window is what bounds the match in time). */
function namesMatch(a, b) {
  if (!a || !b) return true;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/* --------------------------------------------------------------- the window */

function drawEntry(win, o) {
  const kind = o[0];
  if (kind === "box") { pxRect(win, o[1], o[2], o[3], o[4], o[5], o[6]); return; }
  if (kind === "spr") { pxSprite(win, o[1], o[2], o[3]); return; }
  if (kind === "tiled") { pxTiled(win, o[1], o[2], o[3], o[4], o[5], true); return; }
  if (kind === "text") { pxText(win, o[1], o[2], o[3], o[4], o[5], o[6]); return; }
  if (kind === "rich") { pxRich(win, o[1], o[2], o[3], o[4], o[5], o[6]); return; }
  if (kind === "btn") {
    /* Accept/Decline highlight on hover: the label brightens in its own hue
       and the black plate behind it lightens slightly (a faint white veil over
       the plate, under the label so the text stays crisp). Sharp.js repaints
       on pointerover/out, so the canvas glyphs follow the DOM colour. */
    const base = o[6];
    const lit = o[7] === "accept" ? "#00ff00" : o[7] === "decline" ? "#ff4040" : base;
    const veil = mk("div", "tradeBtnVeil");
    place(veil, o[2], o[3], o[4], o[5]);
    veil.style.position = "absolute";
    veil.style.background = "#ffffff";
    veil.style.opacity = "0";
    veil.style.pointerEvents = "none";
    win.appendChild(veil);
    const label = pxText(win, o[1], o[2], o[3], o[4], o[5], { font: "plain12", color: base, align: 1, valign: 1 });
    const hit = pxHit(win, o[2], o[3], o[4], o[5], null, () => { if (o[7] === "accept") acceptClick(); else declineClick(); });
    hit.addEventListener("pointerenter", () => { label.style.color = lit; veil.style.opacity = "0.12"; });
    hit.addEventListener("pointerleave", () => { label.style.color = base; veil.style.opacity = "0"; });
  }
}

/* One offer panel: the items, on the grid the cache's container makes room for.
   The other side's are inert; your own are clicked to take the stack back,
   right-clicked for the Remove rows, and hovered to read what it is - the
   client's own gestures, since an offered item is not in the pack to be
   right-clicked any more. */
function drawOffer(win, side, items, mine) {
  const grid = OFFER[side];
  const cap = OFFER.cols * OFFER.rows;
  for (let i = 0; i < items.length && i < cap; i++) {
    const it = items[i];
    const x = grid.x + (i % OFFER.cols) * OFFER.stepX;
    const y = grid.y + ((i / OFFER.cols) | 0) * OFFER.stepY;
    const d = mk("div", "slot tradeSlot");
    place(d, x, y, 32, 32);
    const img = mk("img");
    img.src = itemIcon(it.id, 32, it.qty);
    img.draggable = false;
    d.appendChild(img);
    if (showsCount(it.id, it.qty)) d.appendChild(mk("span", "qty", amountString(it.qty)));
    const def = itemDef(it.id) || { name: it.id, examine: "It's a " + it.id + "." };
    d.addEventListener("pointerenter", () => showHoverTip(hoverHTML(it, def)));
    d.addEventListener("pointerleave", () => hideHoverTip());
    if (mine) {
      d.addEventListener("click", () => withdrawOffer(i));
      rightMenu(d, (e) => openCtx(e.clientX, e.clientY, null, itemRows(itemName(it.id), removeMenu(i, it))));
    }
    win.appendChild(d);
  }
}

/* The confirmation screen's lists: item names centred under their header - one
   centred column while a side fits in fourteen rows, two columns after that. */
function drawConfirm(win, items, firstCol) {
  const n = Math.min(items.length, CONFIRM_ROWS * 2);
  const solo = n <= CONFIRM_ROWS;
  for (let i = 0; i < n; i++) {
    const x = solo ? (firstCol === 0 ? 65 : 302) : CONFIRM_COLS[firstCol + ((i / CONFIRM_ROWS) | 0)];
    if (x == null) break;
    const it = items[i];
    const label = itemName(it.id) + (it.qty > 1 ? " x " + amountString(it.qty) : "");
    pxText(win, label, x, 66 + (i % CONFIRM_ROWS) * CONFIRM_ROW_H, 110, CONFIRM_ROW_H,
      { font: "plain12", color: "#ffffff", align: 1, nowrap: true });
  }
}

function statusText() {
  if (Trade.stage !== 0) return "";
  if (Trade.accepted) return Trade.theirAccepted ? "" : "Waiting for other player";
  if (Trade.theirAccepted) return "Other player has accepted.";
  return "";
}

/* The waiting dots: one to three, rebuilding every game tick while this side
   is waiting on the other (tickTrade advances Trade._dots). A plain appearing
   count - no fade, no blur. */
function waitingDots() {
  const waiting = Trade.stage === 0
    ? Trade.accepted && !Trade.theirAccepted
    : Trade.accepted;
  return waiting ? ".".repeat(Trade._dots || 1) : "";
}

/* Redraw one dynamic region only (the dots tick must not rebuild the grids -
   that would drop hovers and menus mid-trade). */
function redrawTradeDyn(key) {
  const box = tradeDyn[key];
  if (!box || !box.isConnected || !Trade.partner) return;
  box.innerHTML = "";
  drawDynamic(box, key, -ROOT.x, -ROOT.y, Trade.partner.name);
}

function acceptClick() {
  if (!Trade.partner || Trade.accepted) return;
  if (!hasRoomFor(Trade.theirOffer)) {
    say("You don't have enough inventory space to accept this trade.");
    return;
  }
  Trade.accepted = true;
  Trade._dots = 1;
  Trade._dotsAt = Date.now();
  netTradeAccept();
  refresh();
}

function declineClick() {
  if (!Trade.partner) return;
  const id = Trade.partner.id;
  say("Trade declined.");
  endTrade(true);
  netTradeDecline(id);
}

function bandTile(win, name, x, y) {
  const d = mk("div");
  Frame.setBg(d, name);
  d.style.left = x + "px";
  d.style.top = y + "px";
  win.appendChild(d);
  return d;
}

/* One clipped run of border tiles: art placed exactly, spill cut by the clip.
   pxTiled cannot do this - it adds the cell offset inside the clip and pushes
   6px band art out of view, which was the gaps. */
function hband(win, ox, oy, name, x, y, w) {
  const c = mk("div", "tradeClip");
  place(c, x + ox, y + oy, w, 6);
  c.style.position = "absolute";
  c.style.overflow = "hidden";
  c.style.pointerEvents = "none";
  for (let tx = 0; tx < w; tx += 36) bandTile(c, name, tx, 0);
  win.appendChild(c);
}

function vbar(win, ox, oy, name, x, y, h) {
  const c = mk("div", "tradeClip");
  place(c, x + ox, y + oy, 6, h);
  c.style.position = "absolute";
  c.style.overflow = "hidden";
  c.style.pointerEvents = "none";
  for (let ty = 0; ty < h; ty += 36) bandTile(c, name, 0, ty);
  win.appendChild(c);
}

/* One box ring in the frame kit: 6px bands on the plate edge (plate expanded
   by the 6px offset), corners over the joints - the exterior recipe. */
function ringBox(win, ox, oy, px, py, pw, ph) {
  const Ox = px - 6, Oy = py - 6, Ow = pw + 12, Oh = ph + 12;
  hband(win, ox, oy, "rivetEdgeTop", Ox, Oy, Ow);
  hband(win, ox, oy, "ironRivetsHorizontal", Ox, Oy + Oh - 6, Ow);
  vbar(win, ox, oy, "ironRivetsVertical", Ox, Oy, Oh);
  vbar(win, ox, oy, "rivetEdgeRight", Ox + Ow - 6, Oy, Oh);
  pxSprite(win, "rivetCornerTopLeft", Ox + ox, Oy + oy);
  pxSprite(win, "rivetCornerTopRight", Ox + Ow - 25 + ox, Oy + oy);
  pxSprite(win, "rivetCornerBottomLeft", Ox + ox, Oy + Oh - 30 + oy);
  pxSprite(win, "rivetCornerBottomRight", Ox + Ow - 25 + ox, Oy + Oh - 30 + oy);
}

export function renderTrade(iface) {
  const win = mk("div", "tradeWin");
  place(win, ROOT.x, ROOT.y, ROOT.w, ROOT.h);
  iface.appendChild(win);
  const ox = -ROOT.x, oy = -ROOT.y;
  const table = Trade.stage === 1 ? TRADE_334 : TRADE_335;
  const name = Trade.partner ? Trade.partner.name : "Unknown";
  /* Frame coordinates: the window sits at BANK_WIN and components are drawn
     relative to it, exactly like renderBank. */
  plateBacking(win);
  for (const [pname, px, py] of BANK_PARTS) pxSprite(win, pname, px + ox, py + oy);


  for (const entry of table) {
    const kind = entry[0];
    if (kind === "box") pxRect(win, entry[1] + ox, entry[2] + oy, entry[3], entry[4], entry[5], entry[6]);
    else if (kind === "spr") pxSprite(win, entry[1], entry[2] + ox, entry[3] + oy);
    else if (kind === "tiled") pxTiled(win, entry[1], entry[2] + ox, entry[3] + oy, entry[4], entry[5], true);
    else if (kind === "text") pxText(win, entry[1], entry[2] + ox, entry[3] + oy, entry[4], entry[5], entry[6]);
    else if (kind === "rich") pxRich(win, entry[1], entry[2] + ox, entry[3] + oy, entry[4], entry[5], entry[6]);
    else if (kind === "btn") drawEntry(win, ["btn", entry[1], entry[2] + ox, entry[3] + oy, entry[4], entry[5], entry[6], entry[7]]);
    else if (kind === "dyn") {
      const box = mk("div", "tradeDyn");
      place(box, 0, 0, ROOT.w, ROOT.h);
      win.appendChild(box);
      tradeDyn[entry[1]] = box;
      drawDynamic(box, entry[1], ox, oy, name);
    }
  }
  /* Inner borders in the frame kit: one ring per box, connectors base to top. */
  if (Trade.stage === 1) {
    hband(win, ox, oy, "ironRivetsHorizontal", 12, 56, 488);
    pxSprite(win, "rivetCornerBottomLeft", 12 + ox, 30 + oy);
    pxSprite(win, "rivetCornerBottomRight", 475 + ox, 30 + oy);
    vbar(win, ox, oy, "rivetEdgeRight", 247, 62, 220);
    ringBox(win, ox, oy, 180, 290, 65, 25);
    ringBox(win, ox, oy, 257, 290, 67, 24);
  } else {
    vbar(win, ox, oy, "rivetEdgeRight", 247, 122, 42);
    ringBox(win, ox, oy, 218, 170, 64, 30);
    vbar(win, ox, oy, "rivetEdgeRight", 247, 206, 28);
    ringBox(win, ox, oy, 218, 240, 64, 30);
  }
  /* The close button paints last so the X sits inside the top container. */
  /* The close button with the frame own hover sprite. Closing declines. */
  const cb = CLOSE_BTN.bank;
  const closeSpr = pxSprite(win, "closeButton", cb.x + ox, cb.y + oy);
  const closeHit = pxHit(win, cb.x + ox, cb.y + oy, cb.w, cb.h, "Close", () => declineClick());
  closeHit.addEventListener("pointerenter", () => Frame.setBg(closeSpr, "closeButtonHover"));
  closeHit.addEventListener("pointerleave", () => Frame.setBg(closeSpr, "closeButton"));
  tradeWin = win;
  tradeBuiltStage = Trade.stage;
  tradeBuiltFor = name;
  return win;
}

function drawnWidth(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().width;
}

function drawWaiting(win, ox, oy, msg, y, h, valign, centre, dotsKey) {
  const opt = { font: "plain12", color: "#ffffff", align: 0, nowrap: true };
  if (valign) opt.valign = valign;
  const sc = win.getBoundingClientRect().width / ROOT.w || 1;
  const msgEl = pxText(win, msg, 0, y + oy, 10, h, opt);
  const w = drawnWidth(msgEl) / sc;
  const probe = pxText(win, "...", 0, y + oy, 10, h, opt);
  const maxW = drawnWidth(probe) / sc;
  probe.remove();
  const start = centre - (w + (maxW * 2) / 3) / 2;
  place(msgEl, start + ox, y + oy, w, h);
  Trade[dotsKey + "X"] = start + w - 1;
  Trade[dotsKey + "W"] = maxW;
}

function drawDynamic(win, key, ox, oy, name) {
  if (key === "title") {
    pxText(win, "Trading With: " + name, 19 + ox, 30 + oy, 474, 16, { font: "bold12", color: "#ff981f", align: 1 });
  } else if (key === "name") {
    const slots = Trade.theirSlots;
    const msg = slots == null ? name
      : name + " has<br>" + slots + " free inventory<br>slot" + (slots === 1 ? "." : "s.");
    const sc = win.getBoundingClientRect().width / ROOT.w || 1;
    const probe = pxRich(win, msg, 50 + ox, 80 + oy, 400, 34, { font: "plain11", color: "#ff981f", align: 1, valign: 1 });
    let ink = 0;
    for (const row of probe.children) {
      const rr = document.createRange();
      rr.selectNodeContents(row);
      ink = Math.max(ink, rr.getBoundingClientRect().width / sc);
    }
    probe.remove();
    const textW = Math.ceil(ink) + 6;
    const plateW = textW + 2;
    const plateX = Math.round(250 - plateW / 2);
    pxRect(win, plateX + ox, 78 + oy, plateW, 38, "#000000", 0);
    ringBox(win, ox, oy, plateX, 78, plateW, 38);
    pxRich(win, msg, (plateX + 2) + ox, 80 + oy, textW, 34, { font: "plain11", color: "#ff981f", align: 1, valign: 1 });
  } else if (key === "status") {
    /* Borderless: transparent fill, no stroke, no outline - the message floats
       on the window background. A fixed box right-aligned to the window centre
       (257), so the dots box always starts at the message's end and the message
       never shifts or rejustifies as the dots rebuild. */
    const t = statusText();
    if (!t) return;
    if (waitingDots()) drawWaiting(win, ox, oy, t, 287, 15, 0, 256, "_statusDots");
    else pxText(win, t, 21 + ox, 287 + oy, 470, 15, { font: "plain12", color: "#ffffff", align: 1, nowrap: true });
  } else if (key === "statusDots") {
    /* The dots' own box: left-aligned from the centre, redrawn alone every game
       tick while waiting - the message box above is never touched. */
    /* Persistent dots node: created once per wait, mutated in place by the tick. */
    const d = waitingDots();
    if (d && Trade._statusDotsX != null)
      Trade._statusDotsEl = pxText(win, d, Trade._statusDotsX + ox, 287 + oy, Trade._statusDotsW || 20, 15, { font: "plain12", color: "#ffffff", align: 0, nowrap: true });
    else Trade._statusDotsEl = null;
  } else if (key === "confirmQ") {
    /* The confirmation screen's question - until either side agrees, at which
       point the wait takes its place in the same fixed box (dots live in
       confirmDots, same split as the offer screen's status line). */
    if (Trade.accepted || Trade.theirAccepted) {
      const t = Trade.accepted
        ? "Waiting for other player"
        : "Other player has accepted.";
      if (Trade.accepted) drawWaiting(win, ox, oy, t, 28, 13, 1, 256, "_confirmDots");
      else pxText(win, t, 11 + ox, 28 + oy, 490, 13, { font: "plain12", color: "#ffffff", align: 1, valign: 1, nowrap: true });
    } else {
      pxText(win, "Are you sure you want to make this trade?", 11 + ox, 28 + oy, 490, 13, { font: "plain12", color: "#ffffff", align: 1, valign: 1, nowrap: true });
    }
  } else if (key === "confirmDots") {
    const d = waitingDots();
    if (d && Trade._confirmDotsX != null)
      Trade._confirmDotsEl = pxText(win, d, Trade._confirmDotsX + ox, 28 + oy, Trade._confirmDotsW || 20, 13, { font: "plain12", color: "#ffffff", align: 0, valign: 1, nowrap: true });
    else Trade._confirmDotsEl = null;
  } else if (key === "modified") {
    /* Second screen only, one side only, blinking, and only while the flash is
       fresh: the changed side's own red panel with its own caption. */
    if (Trade.stage === 1 && flashFresh()) {
      const mine = Trade.modifiedSide === "mine";
      if (mine) {
        pxRect(win, 15 + ox, 78 + oy, 233, 236, "#ff0000", 56);
        if (Trade._blinkOn) pxText(win, "! Trade modified", 21 + ox, 263 + oy, 188, 16, { font: "plain11", color: "#ff0000" });
      } else {
        pxRect(win, 254 + ox, 77 + oy, 234, 237, "#ff0000", 56);
        if (Trade._blinkOn) pxText(win, "! Trade modified", 295 + ox, 263 + oy, 175, 16, { font: "plain11", color: "#ff0000" });
      }
    }
  } else if (key === "offerTitles") {
    pxText(win, "You offer:", 20 + ox, 58 + oy, 162, 14, { font: "plain12", color: "#ff981f", align: 1, valign: 1 });
    pxText(win, name + " offers:", 306 + ox, 58 + oy, 178, 14, { font: "plain12", color: "#ff981f", align: 1, valign: 1 });
  } else if (key === "tradingWith") {
    pxRich(win, "Trading with:<br>" + name, 333 + ox, 277 + oy, 150, 33,
      { font: "bold12", color: "#ffffff", align: 1, valign: 2, lineHeight: 14 });
  } else if (key === "gridMine") {
    drawOffer(win, "left", Trade.myOffer, true);
  } else if (key === "gridTheirs") {
    drawOffer(win, "right", Trade.theirOffer, false);
  } else if (key === "confirmLists") {
    drawConfirm(win, Trade.myOffer, 0);
    drawConfirm(win, Trade.theirOffer, 2);
  }
}

/* ---------------------------------------------------------------- the menus */

/* While the window is open the pack's own right-click menu is the trade's: offer
   the stack, an amount of it, or the lot - the wiki's own rows (Offer / Offer-5
   / Offer-10 / Offer-X / Offer-All). Nothing else is reachable until the
   window closes - the client's rule too. There is no Value row: values need
   Grand Exchange prices, which this world has none of. */
function itemMenu(index, def, stack) {
  if (!Trade.partner || Trade.stage !== 0) return null;
  const out = [{ label: "Offer", fn: () => offerItem(index, 1) }];
  if (isStackable(stack.id) && stack.qty > 1) {
    out.push({ label: "Offer-5", fn: () => offerItem(index, 5) });
    out.push({ label: "Offer-10", fn: () => offerItem(index, 10) });
    out.push({ label: "Offer-X", fn: () => offerX(index) });
    out.push({ label: "Offer-All", fn: () => offerItem(index, stack.qty) });
  }
  out.push({ label: "Cancel", fn: () => {} });
  return out;
}

/* Offer-X: the amount box (src/ui.js#openAmountPrompt), with the wiki's K/M
   suffixes parsed at confirm time. */
function offerX(index) {
  const ps = UI.ps;
  if (!Trade.partner || Trade.stage !== 0 || !ps || !ps.inv[index]) return;
  openAmountPrompt("offer", index);
}

function inventoryClick(index) {
  if (!Trade.partner || Trade.stage !== 0) return false;
  const stack = UI.ps.inv[index];
  if (!stack) return false;
  return offerItem(index, 1);
}

/* ------------------------------------------------------------------ clock */

/* One thing needs a clock: a request nobody has answered, the waiting dots
   (one more dot every two game ticks while this side waits on the other),
   the blink phase of the "! Trade modified" caption, and the flash's own
   expiry. The window itself needs none otherwise - every transition is a
   packet. The dots and the blink redraw only their own boxes (a text swap the
   bitmap pass picks up as a content change), never the grids. tickTrade runs
   on the frame loop, so the phases are time-based, not tick-based. */
export function tickTrade() {
  if (Trade.pending && Date.now() - Trade.pending.at > REQUEST_MS) Trade.pending = null;
  if (!Trade.partner || FullIface.open !== "trade") return;
  /* The waiting dots rebuild one dot every game tick for as long as this side
     is waiting on the other - a plain appearing count, no fade. Only the dots'
     own node is mutated in place, never the message and never the grids. */
  const waiting = Trade.stage === 0
    ? Trade.accepted && !Trade.theirAccepted
    : Trade.accepted || Trade.theirAccepted;
  if (waiting) {
    const now = Date.now();
    if (now - (Trade._dotsAt || 0) > 600) {
      Trade._dotsAt = now;
      Trade._dots = (Trade._dots % 3) + 1;
      /* One persistent node, one character at a time: the dots text is swapped
         in place, so nothing rebuilds and nothing flashes. If the node is gone
         (fresh wait with no full redraw yet), fall back to redrawing its box. */
      const dotEl = Trade.stage === 0 ? Trade._statusDotsEl : Trade._confirmDotsEl;
      if (dotEl && dotEl.isConnected) dotEl.textContent = ".".repeat(Trade._dots);
      else redrawTradeDyn(Trade.stage === 0 ? "statusDots" : "confirmDots");
    }
  }
  if (Trade.stage === 1 && Trade.modifiedSide) {
    if (!flashFresh()) {
      /* The flash died: take the panel down once. */
      Trade.modifiedSide = null;
      const box = tradeDyn.modified;
      if (box && box.isConnected) {
        box.innerHTML = "";
        drawDynamic(box, "modified", -ROOT.x, -ROOT.y, Trade.partner.name);
      }
      return;
    }
    const now = Date.now();
    if (now - Trade._blinkAt > 500) {
      Trade._blinkAt = now;
      Trade._blinkOn = !Trade._blinkOn;
      const box = tradeDyn.modified;
      if (box && box.isConnected) {
        box.innerHTML = "";
        drawDynamic(box, "modified", -ROOT.x, -ROOT.y, Trade.partner.name);
      }
    }
  }
}

/* ------------------------------------------------------------------ wiring */

/* The socket's half. src/main.js hands these to initNet: net.js must not import
   a window, and the window must not own a socket - it is told what happened. */
export const tradeNet = { onRequest, onOpen, onOffer, onStatus, onStage, onEnd, onInfo, onLost, onSlots };

export function initTrade(game) {
  /* The other player's menu entry, installed here rather than imported by
     actions.js so that the arrow between the two modules points one way. */
  Actions.playerOptions = (ghost, opts) => {
    opts.push({ label: "Trade with " + playerMenuName(ghost, true), fn: () => request(ghost) });
  };
  UI.actions.tradeMenu = (index, def, stack) => itemMenu(index, def, stack);
  UI.actions.invLeftClick = (index) => inventoryClick(index);
  /* Offer-X/Remove-X amounts land here from the amount box (src/ui.js). The
     window must still be on the offer stage; offerItem/withdrawQty cap the
     amount at what is actually there. */
  UI.actions.tradeAmount = (kind, index, n) => {
    if (!Trade.partner || Trade.stage !== 0) return;
    if (kind === "offer") offerItem(index, n);
    else if (kind === "remove") withdrawQty(index, n);
  };
  /* Bitmap fonts load async: a wait measured under the fallback font wraps wrong.
     Once the real font lands, re-lay the open window so measures hold. */
  if (document.fonts && document.fonts.ready && !Trade._fontsHooked) {
    Trade._fontsHooked = true;
    document.fonts.ready.then(() => { if (FullIface.open === "trade") tradeRefresh(); });
  }
  /* the escrow's save half (src/save.js#setInvEscrow) */
  setInvEscrow(escrowIntoRows);
  return Trade;
}






