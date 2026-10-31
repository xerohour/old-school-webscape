import Frame from "./gameframe.js";
import { boot } from "./game.js";
import * as UI from "./ui.js";
import * as Actions from "./actions.js";
import * as Combat from "./combat.js";
import { initSave, saveGame, serializeState, applyState } from "./save.js";
import { setXpTickSource } from "./skills.js";
import { initPresence, setOnlineCount } from "./presence.js";
import { initNet, netTick, netFrame, netSay, netNpcStates, myConnectionId, Net } from "./net.js";
import { Board } from "./board.js";
import { clearGhosts, tickGhosts, ghostCombat, creatureStateBatch, applyNpcStates, refreshCharacterModels } from "./game.js";
import { KIT_SLOTS } from "./items.js";
/* The ui module's own exported object (as opposed to the module namespace this
   file imports as `UI`): the mutable state it keeps - the elements it found, the
   action hooks other modules fill in - lives on that object. */
import { UI as UIState } from "./ui.js";
import { loadItemSprites, spritesLoaded } from "./icons.js";
import { setItemWeights } from "./items.js";
import { setNpcDefMenus, setLocDefMenus } from "./actions.js";
import { loadNpcSprites, npcSpritesReady } from "./npcsprites.js";
import { loadCharacterModels, loadHeldModels, loadCapeProps, loadGfxModels, loadHeadModels, loadChatExpr, loadCharTextures, modelsReady } from "./models3d.js";
import { loadLocModels, locsReady } from "./locmodels.js";
import { loadTerrain, terrainReady, loadDecor, decorReady } from "./terrain.js";
import { initTrade, tickTrade, tradeNet } from "./trade.js";
import { TitleScreen } from "./titlescreen.js";
import { initSkyDrops } from "./skydrop.js";
import { initSaradomin } from "./saradomin.js";
import { initIban } from "./iban.js";
import { initDesign, DesignScreen } from "./design.js";
import { initNameScreen, NameScreen } from "./charname.js";
import { loadIdentityKits, kitsReady } from "./identikits.js";
import { bakedURL } from "./baked.js";
import { startSharpText } from "./sharp.js";


/* Real 2007 item weights (kg). The drain rate of run energy depends on them,
   and the worn-equipment screen displays them. Baked from the OSRS wiki by
   tools/weights/ into src/data/item-weights.json. */
async function loadItemWeights() {
  try {
    const res = await fetch(bakedURL("src/data/item-weights.json"));
    if (res.ok) setItemWeights(await res.json());
  } catch (err) {
    console.warn("item weights unavailable:", err && err.message);
  }
}

/* The cache's own NPC action lists (unit W): one entry per spawn type, holding
   the NPC id the model was baked from, the def's name, and its five action
   slots. It is what a creature's right-click menu and its left-click default are
   built from (`actions.js#npcMenuRows`, unit W of `PLAN.md`). A miss here is not
   fatal - the menu falls back to the world's own ordering, which is what it used
   before this unit - so it is a warn like the weights above rather than a boot
   failure. */
async function loadNpcDefMenus() {
  try {
    const res = await fetch(bakedURL("src/data/npc-cache-menus.json"));
    if (res.ok) setNpcDefMenus(await res.json());
  } catch (err) {
    console.warn("npc menus unavailable:", err && err.message);
  }
}

/* The cache's own scenery action lists (unit X): one entry per baked loc key,
   holding the loc id the model was baked from, the def's name, and its five
   action slots. The scenery twin of `loadNpcDefMenus` above, and it degrades the
   same way - `actions.js#sceneryRowSpecs` reads it for the word each row uses,
   and a miss leaves the world's own wording standing rather than emptying the
   menu. */
async function loadLocDefMenus() {
  try {
    const res = await fetch(bakedURL("src/data/loc-cache-menus.json"));
    if (res.ok) setLocDefMenus(await res.json());
  } catch (err) {
    console.warn("loc menus unavailable:", err && err.message);
  }
}

const loadingEl = document.getElementById("loading");

/* The game's name lives once, in main.pjs (`gameTitle`). The loading card
   carries a hardcoded copy so it paints before any script runs; this pulls the
   configured name over the top of it so editing `gameTitle` really renames the
   game rather than leaving dead config behind. */
const gameTitleEl = document.querySelector("#loading .loadTitle");
if (gameTitleEl) {
  const configured = window.root && window.root.gameTitle;
  if (configured) gameTitleEl.textContent = String(configured);
}

try {
  /* The interface frame owns the 765x503 window and creates the canvases inside
     it, so it has to exist before anything else is built. */
  await Frame.init(document.getElementById("frameHost"));
  /* The welcome screen (src/titlescreen.js) comes up as soon as the frame that
     hosts it exists, while the bakes are still arriving behind it. Its play
     button does nothing until they have (TitleScreen.setReady), so it is safe to
     start it here rather than waiting - and it is the first thing the player
     sees, exactly as the client's own welcome screen is.

     Entering the world is this screen's one job, so the one-off greeting the
     game shows a newcomer hangs off the play button rather than off the boot
     sequence: it belongs to the world the player has just chosen to enter, not
     to a screen that is still asking them whether they want to. */
  /* Resolved when the character's own save has been read and applied
     (src/save.js#initSave -> loadGame). It is assigned further down, in the
     same synchronous block as the boot, and read by the play button below -
     which cannot be pressed before then, because the button is dead until
     TitleScreen.setReady. A reload a moment after a name was chosen used to be
     able to ask for a name that had just been given, and this is what stops
     that: both questions the play button asks are about the character, and the
     character is not itself until its save has landed. */
  let saveReady = null;
  /* Whether the player has actually walked into the world - the last step of the
     pre-game flow, not the first. Presence is silent until it is true (see the
     `inWorld` dep below): a tab on the welcome screen, or part-way through the
     character-design or name screens, has a socket but no character in the
     world, and announcing it put a body that nobody could reach on everybody's
     Players Online list. */
  let enteredWorld = false;

  /* Leaving the world for the login screen (the logout tab's button,
     ui.js#confirmLogout): a real logout, not a cover thrown over the game. The
     save lands first; then the account session is cleared, the goodbye goes
     out (off everybody's map, roster and count at once), the body's own fight
     and errand are dropped, the body itself is hidden, and the login screen
     comes back up over a town square with nobody standing in it. */
  const leaveWorld = () => {
    const done = () => {
      enteredWorld = false;
      try { Net.logout(); } catch (e) {}
      try { Net.leaveWorld(); } catch (e) {}
      try { Combat.Combat.target = null; } catch (e) {}
      try { Actions.cancelAction(); } catch (e) {}
      try {
        UI.closeInterface();
        UI.closeChatDialog();
        UI.closeModal();
        if (UIState.dismissLevelUp) UIState.dismissLevelUp();
      } catch (e) {}
      const pl = game.player;
      pl.path.length = 0;
      pl.moving = false;
      pl.authHid = true;
      pl.hidden = true;
      TitleScreen.refreshAuth();
      TitleScreen.refresh();
      if (UIState.returnToAuth) UIState.returnToAuth();
    };
    Promise.resolve(saveGame(game, true, true)).catch(() => {}).then(done, done);
  };
  UIState.leaveWorld = leaveWorld;

  const titleShown = TitleScreen.init({
    onPlay: async () => {
      if (Net.reconnect) Net.reconnect();
      TitleScreen.hide();
      if (saveReady) await saveReady;
      /* Both creation screens need the identity-kit bake to draw with, and each
         refuses to open without it (`show` returns false). A character whose
         kits were still in flight would therefore walk into the world unnamed and
         un-designed - so the two questions below are asked only once the bake
         they draw from has landed. It is the same bake the boot waits on, so in
         practice this promise is already settled. */
      await loadIdentityKits();
      /* Walking back in after a logout: the body the login screen hid is
         shown again - unless it was already hiding in a crate, in which case
         it stays hidden (authHid is only ever the login screen's own). */
      /* A character that has just come through the maker gets spoken to: the
         flag is read here (not in `enterWorld`, which every login shares) and
         the Wise Old Man opens his own conversation a breath after the world
         appears - chained behind the greeting popup, so the two never fight
         over the new arrival's attention. */
      let justCreated = false;
      const enterWorld = () => {
        enteredWorld = true;
        /* The design screen and the name step cover the frame after Play (see
           above), so walking out of either is a second stretch of unseen ticks
           on top of the welcome screen's - the same backlog the Play button
           already dropped (src/titlescreen.js#play), dropped again here so the
           world is entered clean however the pre-game flow ran. */
        game.foldBacklog = true;
        if (game.resyncForeground) game.resyncForeground();
        if (game.player.authHid) {
          game.player.authHid = false;
          game.player.hidden = false;
        }
        UI.maybeShowGreeting(() => {
          if (!justCreated) return;
          justCreated = false;
          setTimeout(() => { try { Actions.greetNewArrival(); } catch (e) {} }, 1200);
        });
      };
      /* The name step (src/charname.js), for a character that has never been
         named: it follows the design screen at creation, so the body standing
         behind the name field is the one just designed, and it is the whole of
         the pre-game flow for a character saved before the screen existed -
         whose save carries the generator's placeholder name rather than a
         chosen one (NameScreen.needsNaming). */
      const nameStep = () => NameScreen.needsNaming()
        && NameScreen.show({ onAccept: enterWorld, creating: true });
      /* The client's own flow: pressing play on the welcome screen leads to the
         character-design screen (interface 269) for an account that has never
         chosen a look, and the design screen's Accept is what carries on into
         the world. A character who has been designed - or one whose design data
         could not be loaded - goes straight on. */
      if (DesignScreen.needsDesigning()) {
        await DesignScreen.ready;
        justCreated = true;
        if (DesignScreen.show({ onAccept: () => { if (!nameStep()) enterWorld(); }, creating: true })) return;
      }
      if (nameStep()) return;
      enterWorld();
    },
  }).then(() => TitleScreen.showAuth());
  const canvas = Frame.els.canvas;
  /* ------------------------------------------------------------- the bakes

     Everything the world draws itself with, each with the one question that
     says whether it arrived ("can the thing it feeds draw real art yet?") and
     the loader that fetches it. It is a list because the boot does two things
     with it: it races them against an 8 s clock below, and then, if that clock
     won, it settles the debt (`repairArt`, further down). A bake that is not
     ready when the fold reaches `repairArt` is retried there - a first attempt
     can fail outright on a flaky connection, and until this list existed
     nothing ever tried a second time (the scenery and ground bakes did not even
     *want* a second time: `loadTerrain` latched its failure permanently).

     Every load is wrapped so that a rejection is a warning rather than a dead
     boot: these used to be a bare `Promise.all`, whose first rejection was
     thrown out of the boot's own try and onto the "Something went wrong" card -
     one dropped request and the player got no game at all, rather than a game
     with procedurally drawn stand-ins that fills itself in a second later. */
  const bodyBakes = () => Promise.all([
    loadCharacterModels(), loadHeldModels(), loadCapeProps(), loadGfxModels(), loadHeadModels(), loadChatExpr(), loadCharTextures(),
  ]);
  const ART = [
    { name: "scenery", ready: locsReady, load: loadLocModels },
    { name: "ground", ready: terrainReady, load: loadTerrain },
    { name: "decor atlas", ready: decorReady, load: loadDecor },
    { name: "bodies", ready: modelsReady, load: bodyBakes },
    { name: "identity kits", ready: kitsReady, load: loadIdentityKits },
    { name: "item sprites", ready: spritesLoaded, load: loadItemSprites },
    { name: "NPC sprites", ready: npcSpritesReady, load: loadNpcSprites },
  ];
  const artLanded = Promise.all(ART.map((a) => a.load().catch((e) => {
    console.warn("[art] " + a.name + " unavailable:", e && e.message ? e.message : e);
  })));
  const timeout = new Promise((r) => setTimeout(() => r(0), 8000));
  await Promise.race([
    Promise.all([artLanded, loadItemWeights(), loadNpcDefMenus(), loadLocDefMenus()]),
    timeout,
  ]);
  const game = boot(canvas);
  game.view.applyTerrainTextures();

  /* ------------------------------------------------------- the art's half

     The other half of the bargain the 8 s guard makes. The guard is deliberate:
     the bakes are megabytes (the player models alone are ~3 MB), and a slow
     connection should get the world and the welcome screen immediately rather
     than a loading card for a minute. The price is that the world - and every
     body in it - is built from the procedural stand-ins, and THIS is what pays
     it: wait for whatever is still in flight, retry whatever came back empty,
     then redraw everything that was drawn without its art.

     What it was, before this: `Promise.all([locsPromise, terrainPromise])`,
     which repaired the ground and the scenery and nothing else. A player whose
     bakes landed at nine seconds therefore kept **blocky stand-in bodies**
     (src/entities.js#makeCharacter) - their own character, every NPC, every
     other player - for the rest of the session, and their character's held and
     worn models were whatever the bake contained at the moment the body was
     built. The user's screenshot of 2026-09-24 is that state, and it is why the
     ground and scenery in it are right while the bodies are not: those two had
     a repair and the bodies did not.

     Every step is a no-op when the art is already in place, which is why this
     only runs at all when the guard actually cut something off. */
  const repairArt = async () => {
    await artLanded;
    for (const a of ART) {
      for (let attempt = 0; attempt < 3 && !a.ready(); attempt++) {
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        try {
          await a.load();
        } catch (e) {
          console.warn("[art] " + a.name + " retry failed:", e && e.message ? e.message : e);
        }
      }
      if (!a.ready()) console.warn("[art] " + a.name + " never arrived - its stand-ins stay");
    }
    /* the scenery, in the one order that matters: the material, then the ground
       under it, then every chunk and the roofs and doors that stand on the baked
       wall height (see src/scene.js#attachLocAtlas) */
    game.view.attachLocAtlas();
    game.view.applyTerrainTextures();
    game.view.rebuildAllChunks();
    game.view.rebuildStructures();
    /* ...and every body, which no chunk rebuild can reach (src/game.js
       #refreshCharacterModels) */
    refreshCharacterModels();
    /* the interface reads the same bakes: the pack's icons, the worn-equipment
       doll, and the skill tab's icons */
    UI.mark("inv", "equip", "skills");
  };
  if (ART.some((a) => !a.ready())) window.__artRepair = repairArt();
  UI.initUI(game);
  /* the interface's text, rasterised a canvas per layer so it scales with the
     sprites instead of being anti-aliased (src/sharp.js) */
  startSharpText();
  Actions.initActions(game);
  Combat.initCombat(game);
  initTrade(game);
  /* Every xp gain is stamped with the sim tick that earned it, so two gains
     from one tick can share a floating figure and two from different ticks
     cannot (src/skills.js#setXpTickSource). Installed before the hooks below,
     because the first xp of the session is earned on the first tick. */
  setXpTickSource(() => game.tickCount);
  /* the interface animates every frame (minimap, orbs, xp drops, the click
     marker); the 600ms tick only drives the game logic. The other players'
     ghosts (src/game.js#tickGhosts) and the world server's clocks ride the same
     two hooks - one frame loop, one tick, however many systems need one. */
  game.hooks.onFrame = (dt) => {
    UI.tick(game, dt);
    tickGhosts(dt);
    netFrame(dt);
    tickTrade();
    /* the same frame clock the model animates on, for the one beat that has to
       land on a frame rather than on a tick - the teleport's jump (see
       src/actions.js#holdForTeleport) */
    Actions.tickActionFrames(dt);
  };
  game.hooks.onTick = (dt) => {
    Actions.tickActions(game, dt);
    Combat.tickCombat(game, dt);
    idleTick();
  };
  let lastInputAt = Date.now();
  let idleWarned = false;
  const IDLE_LOGOUT_MS = 30 * 60 * 1000;
  for (const ev of ["pointerdown", "keydown"]) {
    window.addEventListener(ev, () => { lastInputAt = Date.now(); idleWarned = false; }, { passive: true, capture: true });
  }
  function playerActive() {
    try {
      const p = game.player;
      if (!p) return false;
      if (p.moving) return true;
      if (p.path && p.path.length) return true;
      if ((p.actionAnim || 0) > 0) return true;
      if (Actions.isBusy && Actions.isBusy()) return true;
      if (Combat.target) return true;
      return false;
    } catch (e) { return false; }
  }
  function idleTick() {
    if (!enteredWorld) return;
    if (playerActive()) { lastInputAt = Date.now(); idleWarned = false; return; }
    const idle = Date.now() - lastInputAt;
    if (idle > IDLE_LOGOUT_MS) {
      lastInputAt = Date.now();
      idleWarned = false;
      enteredWorld = false;
      /* Back to the title screen through a reload: the welcome screen can only
         ever be left once per page (src/titlescreen.js#show), so showing it is
         a no-op from here - a fresh boot is the real login screen. The flag is
         what the title reads to say why. */
      try { sessionStorage.setItem("wsTitleNote", "idle"); } catch (e) {}
      const done = () => { try { Net.logout(); } catch (e) {} setTimeout(() => location.reload(), 800); };
      Promise.resolve(saveGame(game, true, true)).catch(() => {}).then(done, done);
    } else if (idle > IDLE_LOGOUT_MS - 60000 && !idleWarned) {
      idleWarned = true;
      UI.chat("You will be logged out in one minute for being idle.", "warn");
    }
  }
  setInterval(idleTick, 10000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const p = game.player;
    if (!p) return;
    if (p.castAnim && !p.castLoop) {
      p.castAnim = null;
      p.castLeft = 0;
      p.castLoop = false;
      p.castTail = false;
      p.castClamp = false;
      p.castTool = null;
    }
    if (p.emoteAnim) {
      p.emoteAnim = null;
      p.emoteLeft = 0;
    }
  });
  saveReady = Promise.resolve(initSave(game));
  saveReady.then(() => TitleScreen.refresh());
  /* The world server (src/net.js): presence, chat and the account. Everything
     it needs is handed in rather than imported, so the networking module stays
     free of the interface and the save format - and so this one place shows what
     the rest of the game gives it. */
  /* The roster (who is online) is drawn in two places - the corner line's
     tooltip and the Players Online tab - so anything that changes it redraws
     both: the side panel only repaints the tab it is showing, and the tab is
     not necessarily the one the change arrived for. */
  const refreshRoster = () => {
    UI.mark("online", "friends");
  };
  initNet(game, {
    chat: (msg, cls, name, mod) => UI.chat(msg, cls, name, mod),
    equipSlots: KIT_SLOTS,
    /* Presence is silent until the player has actually walked into the world
       (see `enteredWorld` above, and src/net.js#canSend): a socket sitting on
       the welcome screen - or on the character-design or name screens - is not
       a player in the world, and announcing it made it appear on everybody's
       Players Online list as a body nobody could reach. */
    inWorld: () => enteredWorld,
    /* the options panel's Accept Aid toggle, carried to the neighbours on the
       kit packet (src/net.js#kitText) so a caster can tell who wants helping */
    acceptsAid: () => UI.acceptsAid(),
    applyState: (data) => applyState(game, data),
    serialize: () => serializeState(game),
    clearGhosts,
    onStatus: refreshRoster,
    onCount: setOnlineCount,
    /* Booted (moderator ::kickall, or this account logging in elsewhere): the
       socket is already closed with no reconnect coming, so the game is saved
       and the player is sent back to the title screen with the reason -
       pressing Play reconnects (see onPlay above). */
    onKicked: (note) => {
      enteredWorld = false;
      try { sessionStorage.setItem("wsTitleNote", note === "elsewhere" ? "elsewhere" : "kicked"); } catch (e) {}
      const done = () => { try { Net.logout(); } catch (e) {} setTimeout(() => location.reload(), 800); };
      Promise.resolve(saveGame(game, true, true)).catch(() => {}).then(done, done);
    },
    onRoster: refreshRoster,
    /* Private messages (src/net.js#netPM): both directions land in the chatbox,
       which decides between the split window and the log from the player's own
       "Split private chat" setting (src/ui.js#privateMessage). */
    onPM: (name, text, outgoing) => UIState.privateMessage(name, text, outgoing),
    onPMInfo: (reason) => UIState.privateMessageInfo(reason),
    trade: tradeNet,
    /* Spells aimed at another player (src/actions.js#remoteSpell) and the stat
       read-out that Stat Spy asks its target for. A cast thrown at a creature
       carries the victim's spawn index past the power, so the watchers can fly
       the missile at their own copy of it. */
    spell: (from, spellId, target, power, ix) => Actions.remoteSpell(from, spellId, target, power, ix),
    /* Somebody else's self-cast and teleport arrival (src/actions.js
       #remoteCastFx and #remoteArrive): the pose and gather graphic of a
       utility spell on their ghost, and the arrival pose with its reversed
       bubble on the landing tile. */
    castFx: (from, spellId) => Actions.remoteCastFx(from, spellId),
    grabFx: (from, spellId, x, z) => Actions.remoteGrabFx(from, spellId, x, z),
    gfxFx: (from, gfxId, height) => Actions.remoteGfxFx(from, gfxId, height),
    arrive: (from, spellId, x, z) => Actions.remoteArrive(from, spellId, x, z),
    spyStats: (from, blob) => Actions.showSpyStats(from, blob),
    /* Another player's fight (src/game.js#ghostCombat, src/combat.js
       #remoteCreatureCast): their swing pose goes on their ghost, their
       hitsplats go on the creature the packet names - by its index in the
       shared spawn table - and a creature's cast on them plays on this
       client's copy of the caster, so a watched fight throws spells instead
       of punches. */
    combat: (id, kind, a, b, c, ix) => kind === 3 ? Combat.remoteCreatureCast(id, a, ix) : ghostCombat(id, kind, a, b, c, ix),
    /* And the creatures themselves (src/game.js#applyNpcStates): where another
       client says the bodies it can see are, how hurt they are, and whether
       they are dead. The id of the connection that sent it comes with it,
       because which of two players' copies of a creature wins is decided from
       that id and our own (see src/game.js's note on the census). */
    npcState: (id, list) => applyNpcStates(id, list, myConnectionId()),
    /* The shared world (src/actions.js's "the world ledger", src/net.js#netLoc
       and #netGround, index.html's ledger block): a tile's own state - a door's
       leaf, a tree's stump, a rock's ore, a stall's shelf, a lit fire - and the
       piles lying on the ground. It is everything one player changes and
       everybody else is standing in front of, and it is shared rather than
       simulated per client: the server holds the record and hands the ring a
       client has just walked into back to it whole, which is both how a newcomer
       learns the world and how a drift - or a server restart - is repaired.
       The shops ride the same ledger and the same packets but are keyed by name
       rather than by tile, so they are asked for rather than walked into (see
       `worldShop` below). */
    worldLoc: (x, z, bits, hp, remain) => Actions.remoteLocState(x, z, bits, hp, remain),
    worldGround: (from, x, z, id, qty, base) => Actions.remoteGroundState(from, x, z, id, qty, base),
    worldSnapshot: (cx, cz, records) => Actions.applyWorldRing(cx, cz, records),
    /* ...and the shops, the one shared thing that is not a place: a counter's
       shelves, filed under the shop's own key rather than a tile, so they are
       asked for when a counter is opened and never appear in a ring snapshot
       (src/ui.js#applyShopStock, index.html's WK_SHOP). */
    worldShop: (key, flags, rows, remain) => UI.applyShopStock(key, flags, rows, remain),
  });
  UIState.actions.chat = (text) => netSay(text);
  /* the world server's own clocks ride the game's: presence on the tick, the
     ghost timeout on the frame */
  const tickNet = game.hooks.onTick;
  game.hooks.onTick = (dt) => {
    tickNet(dt);
    netTick(dt);
    /* ...and the creature census, once a tick: the bodies this player can see,
       told to the players around them so that everyone is looking at the same
       creatures (src/game.js#creatureStateBatch, src/net.js#netNpcStates). It
       is built and dropped in the same breath when there is nobody nearby, so a
       player alone never pays for it. */
    const census = creatureStateBatch();
    if (census) netNpcStates(census);
  };
  /* The partyhat shower (src/skydrop.js): its own clock and the hats it is
     bringing down ride the two hooks, like everything else here. Armed after
     the hooks above so a wave lands on the ground its own items read; `::party`
     fires one by hand. */
  initSkyDrops(game);
  /* The god in the north-western woods (src/saradomin.js): a fight no creature
     AI can express - a stationary body throwing a multi-target strike on its
     own clock - so it owns a module and rides the tick hook. Wired after the
     hooks above so it acts on the tick's settled state. */
  initSaradomin(game);
  initIban(game);
  /* The character-design screen (src/design.js): the client's interface 269,
     drawn when a character who has never chosen a look presses play, and by
     `::design` afterwards. It brings its own layer and its own per-frame paint
     of the preview, so all it needs here is the game. */
  initDesign(game);
  /* The name step (src/charname.js): the screen between designing a character
     and walking into the world, and the way back to it in play (`::name`). Like
     the design screen it brings its own layer and its own per-frame paint of the
     preview, so all it needs here is the game. */
  initNameScreen(game);
  /* the counters - independent of the game, so they come up even if the server
     plugin is unavailable (see src/presence.js) */
  initPresence({
    viewCount: Frame.els.viewCount,
    onlineCount: Frame.els.onlineCount,
  });
  /* The message board (src/board.js): its channel, its log, and the one-off
     notice the author wrote. The channel is only created when the board's tab
     is first opened (src/ui.js#renderBoard calls Board.ensureChannel), so a
     player who never looks at it never pays for the iframe. */
  Board.init({
    mount: document.body,
    chat: (msg, cls, name, mod) => UI.chat(msg, cls, name, mod),
    notice: () => UI.openBoardNotice(),
  });
  /* A remembered login is resumed silently: the returning player simply finds
     their character already loaded - and the welcome screen's own account lines
     are re-read once it has landed. The welcome screen's button waits on this
     (see the timeout below), because an account's name IS its character's name
     (src/net.js#setCharacterName): whether this character has a name, which is
     what the button has to know before it shows the name step, is not settled
     until the account has answered. */
  const accountReady = Net.status !== "offline"
    ? Promise.resolve(Net.resume()).then(() => {
      TitleScreen.refresh();
      /* A remembered login skips the pre-title screen entirely: the player
         wakes up on the welcome screen already logged in. */
      if (Net.account) TitleScreen.show();
    })
    : Promise.resolve();
  UI.mark("inv", "equip", "bank", "skills");
  window.__game = game;
  window.__gameBooted = true;
  setTimeout(async () => {
    /* The world exists now, so the welcome screen's button may be pressed. Its
       own texts are refreshed last, because they report the account the save has
       just restored (the bank, the purse, the last-login line) - and the frame is
       only revealed underneath the loading card once they are on screen, so the
       two never show different numbers. */
    TitleScreen.game = game;
    /* showAuth may have run before the game existed to hang the flag on (the
       login screen comes up while the world is still building) - so the pan
       is re-asserted here once there is a game to hold it. */
    if (TitleScreen.authUp) game.authPan = true;
    /* the character is not itself until both of these have landed - its save,
       and its account if it has one - and the play button decides what to ask
       next from what the character knows about itself */
    await saveReady;
    await accountReady;
    await titleShown;
    await TitleScreen.refresh();
    TitleScreen.setReady(true);
    if (loadingEl) {
      loadingEl.style.opacity = "0";
      setTimeout(() => {
        loadingEl.hidden = true;
      }, 500);
    }
  }, 350);
} catch (err) {
  console.error(err);
  if (loadingEl) {
    loadingEl.innerHTML =
      '<div class="rs-title">Something went wrong</div><div class="rs-sub">' + String(err && err.message ? err.message : err) + "</div>";
  }
}
