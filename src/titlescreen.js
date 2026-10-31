/* ===========================================================================
   titlescreen.js — the client's own pre-game screen: cache interface 378.

   The real client does not drop a player into the world. It shows one screen
   first, and this cache defines it as an interface rather than as art: archive
   378 of config index 3 is "Welcome to RuneScape / CLICK HERE TO PLAY", with the
   layout of every piece on it - a parchment banner that carries the title, four
   stone boxes in a 2x2 grid, each with an icon (a key, a sealed envelope, a bank
   chest, a pile of coins), and the red button that starts the game with the
   sword icon riding on it. `src/data/welcome-screen.json` is that interface,
   component for component, baked straight out of the cache by
   `tools/cache-bake/welcome-bake-run.mjs` (recipe in the cache-bake README);
   this module draws it and nothing else.

   ## What the cache does not carry

   Five of the screen's texts are EMPTY in the cache - the four box bodies and
   the "you last logged in" line - because the client fills them at runtime from
   the account it has just logged in as: the live game's boxes report unread
   messages, a bank PIN and remaining membership. So they are the world's own
   here, and truthful rather than decorative: the key box carries the password
   rule (this world has real accounts, src/net.js), the envelope box reports the
   message board's unread notice (src/board.js#seenNotice), the bank box counts
   the bank, the coins box counts the coins, and the line under the banner says
   when this character was last saved (src/save.js#lastSavedAt). The banner's own
   text is the game's configured name (`gameTitle` in main.pjs), the same source
   the loading card reads.

   Two more components are deliberately not drawn: the cache's single "line"
   widget that does carry text (file 19) tells the player to log out, visit the
   front page of the website and open Profile & Settings, which is an instruction
   for a website this world has no equivalent of; and the version of this screen
   the live game later shipped also has a bottom message-of-the-week banner and a
   "Switch style" button, neither of which is in this cache's interface at all.

   ## Where it sits, and what it swallows

   It is the overlay layer's (gameframe.js#LAYER_Z.overlay) first child, so it
   covers the frame chrome and the world but still lets the tip and the corner
   counters paint over it - the client's own screen has hovering text on top of
   it too. It takes the pointer (`pointer-events: auto`), which is what stops the
   world underneath from being hovered or turned while it is up: the client's own
   input listeners are on the game canvas (src/game.js), so a hit-testable layer
   over that canvas is enough. The orb cluster is the one piece of the HUD the
   client never draws there, so a class on the frame hides it (style.css).
   =========================================================================== */

import { Frame, FRAME_W, FRAME_H } from "./gameframe.js";
import { kit, UI } from "./ui.js";
import { Net } from "./net.js";
import { Board } from "./board.js";
import { initAuthCounters } from "./presence.js";
import { lastSavedAt } from "./save.js";
import { formatNum } from "./util.js";
import { bakedURL } from "./baked.js";

const { mk, place, pxSprite, pxText, pxHit } = kit;

const DATA_URL = bakedURL("src/data/welcome-screen.json");

/* The five texts the cache leaves to the client, keyed by the component number
   the bake wrote them with. `TITLE` and `LAST_SEEN` are the banner's own line
   and the one under it; the rest are the four boxes, named after the icon each
   one carries. */
const TEXT_KEYS = { 12: "title", 13: "lastSeen", 14: "key", 15: "mail", 16: "bank", 18: "coins" };

/* The play button's component, and the sprite on it that lights up when the
   cursor is over it. The cache's own button has one frame only, so the hover
   cue is ours - without it nothing on a static screen says "click me". */
const PLAY_PART = 6;
const PLAY_SPRITE = "welcomePlayButton";

const USER_FONT_PX = ["15px rs-quill8", "12px rs-plain12", "12px rs-bold12"];

const hex = (n) => "#" + ((n >>> 0) & 0xffffff).toString(16).padStart(6, "0");

/* How long ago a timestamp was, in the live game's own three steps ("You last
   logged in a minute ago"), with the first-visit line the client shows for an
   account that has never played. */
function lastSeenLine(at) {
  if (!at) return "This is your first visit to this world. Good luck!";
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (secs < 60) return "You last logged in less than a minute ago.";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return "You last logged in " + mins + (mins === 1 ? " minute" : " minutes") + " ago.";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return "You last logged in " + hours + (hours === 1 ? " hour" : " hours") + " ago.";
  const days = Math.floor(hours / 24);
  return "You last logged in " + days + (days === 1 ? " day" : " days") + " ago.";
}

/* The client's own thousands separator (util.js#formatNum), so a purse of
   200,000 coins reads the way the inventory reads it. */
function bankLine(n) {
  if (!n) return "Your bank is empty.";
  return "Your bank holds " + formatNum(n) + (n === 1 ? " item." : " items.");
}

function coinsLine(n) {
  if (!n) return "You have no coins in this world yet.";
  return "You have " + formatNum(n) + (n === 1 ? " coin" : " coins") + " in total.";
}

export const TitleScreen = {
  data: null,
  game: null,
  layer: null,
  /** component number -> the text element the cache's layout placed */
  texts: new Map(),
  playEl: null,
  ready: false,
  up: false,
  /* set once the player has left the welcome screen; see `show` */
  _left: false,
  _onPlay: null,
  _mail: null,

  async init({ game, onPlay }) {
    this.game = game;
    this._onPlay = onPlay;
    /* The in-game logout tab's way back here (ui.js#confirmLogout): the latch
       is cleared so the pre-title screen can come back up, then it does. */
    UI.returnToAuth = () => {
      this._left = false;
      this._playQueued = false;
      this.hide();
      this.refreshAuth();
      this.refresh();
      this.showAuth();
    };
    const res = await fetch(DATA_URL, { cache: "force-cache" });
    this.data = await res.json();
    /* The frame's bitmap faces are webfonts; the text is placed against their
       metrics (ui.js#PX_FONTS), so the screen must not be built before they are
       there or the first paint is measured in a fallback face. */
    await Promise.all(USER_FONT_PX.map((f) => document.fonts.load(f).catch(() => {})));
    this._build();
    return this;
  },

  _build() {
    const layer = mk("div", "layer titlescreen");
    layer.style.background = this.data.background || "#000000";
    layer.hidden = true;
    place(layer, 0, 0, FRAME_W, FRAME_H);
    const overlay = Frame.layers.overlay;
    overlay.insertBefore(layer, overlay.firstChild);
    this.layer = layer;

    /* The components are drawn in the cache's own order, which is also the
       client's draw order: the background, the banner, the four boxes, the
       button and its sword, the box icons, then the texts (the title over the
       banner, the last-seen line under it, the four bodies). Nothing here is
       sorted or re-stacked - the order in the data file is the order. */
    for (const p of this.data.parts) {
      if (p.type === 5) {
        const e = pxSprite(layer, p.sprite, p.x, p.y);
        if (p.id === PLAY_PART) this.playEl = e;
      } else if (p.type === 4) {
        const key = TEXT_KEYS[p.id];
        const e = pxText(layer, p.text || "", p.x, p.y, p.w, p.h, {
          font: p.font,
          color: hex(p.colour == null ? 0xffffff : p.colour),
          align: p.align === "center" ? 1 : p.align === "right" ? 2 : 0,
          /* The cache's own vertical alignment (0/1/2 = top/centre/bottom); a
             row the bake wrote before the names were tidied may still say
             "left", which is the same 0. */
          valign: p.valign === "center" ? 1 : p.valign === "bottom" ? 2 : 0,
          shadow: !!p.shadow,
        });
        if (key) this.texts.set(key, e);
      }
    }

    /* The button is the only way out of the screen, which leaves a keyboard
       player with no way into the world at all; Enter and Space do what the
       button does. Only while the screen is up, so nothing here can shadow a
       key the game wants. */
    window.addEventListener("keydown", (e) => {
      if (!this.up) return;
      /* typing in the login form is not playing: Enter there works the form's
         own buttons (a real <form> submit), and Space is just a character */
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON")) return;
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault();
      this.play();
    });

    const play = this.data.parts.find((p) => p.id === PLAY_PART);
    if (play) {
      const hit = pxHit(layer, play.x, play.y, play.w, play.h, null, () => this.play());
      hit.id = "titlePlay";
      hit.addEventListener("pointerenter", () => { if (this.playEl) this.playEl.style.filter = "brightness(1.3)"; });
      hit.addEventListener("pointerleave", () => { if (this.playEl) this.playEl.style.filter = ""; });
    }
    this._buildAuth();
    /* The welcome screen's one line: who walks in when Play is pressed, and
       the way back out to the pre-title screen. */
    this.authGoEl = mk("div", "taWelcome");
    place(this.authGoEl, 132, 420, 501, 20);
    layer.appendChild(this.authGoEl);
    this.authOutBtn = mk("button", "rs-btn taWelcomeOut");
    this.authOutBtn.type = "button";
    this.authOutBtn.textContent = "Log out";
    place(this.authOutBtn, 332, 445, 100, 26);
    this.authOutBtn.addEventListener("click", () => {
      Net.logout();
      this._left = false;
      this.refreshAuth();
      this.refresh();
      this.showAuth();
    });
    layer.appendChild(this.authOutBtn);
  },

  /* The pre-title screen: the account comes before the world. At boot the
     game shows this and nothing else; a remembered login skips straight past
     it to the welcome screen, everyone else types a name and password (or
     plays as a guest) to get there. The welcome screen keeps only the
     one-line answer to "who am I" plus a way out. */
  authLayer: null,
  authUp: false,
  authBox: null,
  authName: null,
  authPass: null,
  authStatusEl: null,
  authGoEl: null,
  authOutBtn: null,
  authBusy: false,

  _buildAuth() {
    const layer = mk("div", "layer titleauthscreen");
    layer.style.background = "rgba(16,16,16,0.7)";
    layer.hidden = true;
    place(layer, 0, 0, FRAME_W, FRAME_H);
    Frame.layers.overlay.appendChild(layer);
    this.authLayer = layer;
    const inner = mk("div", "taPre");
    const title = mk("div", "taTitle", this.gameTitle());
    inner.appendChild(title);
    const box = mk("div", "titleauth");
    const form = mk("form", "taForm");
    form.autocomplete = "off";
    const row1 = mk("div", "taRow");
    this.authName = mk("input", "rs-field taName");
    this.authName.type = "text";
    this.authName.maxLength = 12;
    this.authName.placeholder = "Username";
    this.authName.autocomplete = "off";
    this.authName.autocapitalize = "off";
    this.authName.autocorrect = "off";
    this.authName.spellcheck = false;
    this.authPass = mk("input", "rs-field taPass");
    this.authPass.type = "text";
    this.authPass.maxLength = 64;
    this.authPass.placeholder = "Password";
    this.authPass.autocomplete = "off";
    this.authPass.autocapitalize = "off";
    this.authPass.autocorrect = "off";
    this.authPass.spellcheck = false;
    this.authPass.setAttribute("aria-label", "Password");
    try {
      const saved = JSON.parse(localStorage.getItem("wsCreds") || "null");
      if (saved && saved.name) this.authName.value = saved.name;
      if (saved && saved.pass) this.authPass.value = saved.pass;
    } catch (e) {}
    row1.appendChild(this.authName);
    row1.appendChild(this.authPass);
    const row2 = mk("div", "taRow");
    const loginBtn = mk("button", "rs-btn");
    loginBtn.type = "submit";
    loginBtn.textContent = "Log in";
    const regBtn = mk("button", "rs-btn");
    regBtn.type = "button";
    regBtn.textContent = "Create account";
    regBtn.addEventListener("click", () => this._authRun("register"));
    row2.appendChild(loginBtn);
    row2.appendChild(regBtn);
    form.addEventListener("submit", (e) => { e.preventDefault(); this._authRun("login"); });
    form.appendChild(row1);
    form.appendChild(row2);
    box.appendChild(form);
    this.authStatusEl = mk("div", "taStatus");
    box.appendChild(this.authStatusEl);
    inner.appendChild(box);
    const newcomer = mk("div", "taNew");
    newcomer.innerHTML = "New here? Type a name and password, then Create account.<br>Returning user? Log in.<br><br><br>Or, do it later:";
    inner.appendChild(newcomer);
    const guest = mk("button", "rs-btn taGuestBtn");
    guest.type = "button";
    guest.textContent = "Play Now";
    guest.addEventListener("click", () => {
      if (this.ready) { this.play(); return; }
      /* The world is still building: wait on the boot's own loading card
         rather than the welcome screen, and walk in the moment it is ready. */
      const loadingEl = document.getElementById("loading");
      if (!loadingEl || /Something went wrong/.test(loadingEl.innerHTML)) {
        this.authStatus("The world failed to load - reload the page and try again.");
        return;
      }
      this._playQueued = true;
      loadingEl.hidden = false;
      loadingEl.style.opacity = "";
    });
    inner.appendChild(guest);
    const counters = mk("div", "taCounters");
    const viewsEl = mk("span", null);
    const onlineEl = mk("span", null);
    counters.appendChild(viewsEl);
    counters.appendChild(onlineEl);
    layer.appendChild(counters);
    initAuthCounters(viewsEl, onlineEl);
    layer.appendChild(inner);
    this.authBox = box;
    this.refreshAuth();
  },

  authStatus(text) {
    if (this.authStatusEl) this.authStatusEl.textContent = text || "";
  },

  /* The welcome screen's one line: who walks in when Play is pressed. */
  refreshAuth() {
    if (this.authGoEl) {
      this.authGoEl.textContent = Net.account
        ? "Logged in as " + Net.account + ". Press Play to enter the world."
        : "Playing as a guest. Press Play to enter the world.";
    }
    if (this.authOutBtn) this.authOutBtn.style.display = Net.account ? "" : "none";
    if (!Net.account && this.authStatusEl && !this.authStatusEl.textContent) {
      let note = "";
      try { note = sessionStorage.getItem("wsTitleNote") || ""; sessionStorage.removeItem("wsTitleNote"); } catch (e) {}
      if (note === "kicked") this.authStatusEl.textContent = "A moderator has logged you out.";
      else if (note === "elsewhere") this.authStatusEl.textContent = "Your account logged in somewhere else.";
      else if (note === "idle") this.authStatusEl.textContent = "You were logged out for being idle for 30 minutes.";
    }
  },

  async _authRun(kind) {
    if (this.authBusy || Net.account) return;
    const name = (this.authName.value || "").trim();
    const pass = this.authPass.value || "";
    if (!name) { this.authStatus("Enter a username first."); return; }
    if (kind === "register" && pass.length < 6) { this.authStatus("A password needs at least 6 characters."); return; }
    this.authBusy = true;
    this.authStatus(kind === "login" ? "Logging in..." : "Creating the account...");
    let res;
    try {
      res = kind === "login" ? await Net.login(name, pass) : await Net.register(name, pass);
    } catch (err) {
      res = { ok: false, error: "Not connected to the world server yet - try again in a moment." };
    }
    this.authBusy = false;
    if (!res.ok) { this.authStatus(res.error); return; }
    try {
      if (pass) localStorage.setItem("wsCreds", JSON.stringify({ name, pass }));
    } catch (e) {}
    this.authPass.value = "";
    this.authStatus("");
    this.refreshAuth();
    this.refresh();
    if (kind === "register" && this.ready) { this.play(); return; }
    this.show();
  },

  /* The screen's own title: the cache's is "Welcome to RuneScape", and the game
     carries its name once (main.pjs `gameTitle`), so the world's name is what
     the banner says. */
  gameTitle() {
    const configured = typeof root !== "undefined" && root && root.gameTitle;
    return configured ? String(configured) : "RuneScape";
  },

  set(key, text) {
    const e = this.texts.get(key);
    if (e) e.textContent = text;
  },

  /* Re-read everything that can change between two visits. The board's notice
     lives in the browser's storage, so the mail box resolves a moment later
     than the rest; the rest of the screen is already painted. */
  async refresh() {
    const g = this.game;
    const ps = g && g.ps;
    const title = this.gameTitle();
    this.set("title", "Welcome to " + title);
    this.set("lastSeen", lastSeenLine(lastSavedAt()));
    this.set("key", "Never tell anyone your password, even if they say they work for the game!");
    if (ps) {
      this.set("bank", bankLine((ps.bank || []).filter(Boolean).length));
      let coins = 0;
      for (const s of ps.inv || []) if (s && s.id === "coins") coins += s.qty;
      for (const s of ps.bank || []) if (s && s.id === "coins") coins += s.qty;
      this.set("coins", coinsLine(coins));
    }
    let seen = true;
    try { seen = await Board.seenNotice(); } catch (err) { seen = true; }
    this.set("mail", seen
      ? "You have no unread messages in your message centre."
      : "You have an unread message from the game's author on the message board.");
    this.refreshAuth();
  },

  show() {
    /* Up until the player leaves it, and never again. `main.js` shows this
       screen from the promise that builds it, and the button goes live from a
       *different* promise (the world's own readiness) - so a player who presses
       Play the moment it lights up can do so before the build promise settles,
       and the screen then comes back up over a game that is already running
       behind it. The world does not pause for this screen, so that is a black
       cover with a live game underneath and no way back except a reload. The
       latch is what makes leaving it final. */
    if (!this.layer || this.up || this._left) return;
    this.up = true;
    this.hideAuth();
    UI.worldBlocked = true;
    this.layer.hidden = false;
    Frame.root.classList.add("titleup");
    /* The world's own hover reads the last cursor position it saw, and that
       position can predate this screen; dropping it is what keeps the world's
       hover label from being drawn over the black. */
    if (this.game) this.game.pointer = null;
    this.refresh();
  },

  hide() {
    if (!this.layer || (!this.up && !this.authUp)) return;
    this.up = false;
    this.hideAuth();
    UI.worldBlocked = false;
    this.layer.hidden = true;
    Frame.root.classList.remove("titleup");
  },

  /* The pre-title screen, up and down. It is a different layer from the
     welcome screen with its own flag, so the welcome screen's never-come-back
     latch never touches it. */
  showAuth() {
    if (!this.authLayer || this._left) return;
    this.up = false;
    if (this.layer) this.layer.hidden = true;
    this.authUp = true;
    this.authLayer.hidden = false;
    Frame.root.classList.add("authpan");
    Frame.showWorld = true;
    /* The world behind this screen is a generic town-square pan, not the
       player's own view: the camera orbits the square (game.js#updateVisuals)
       and the player's body is out of it either way. */
    if (this.game) this.game.authPan = true;
    UI.worldBlocked = true;
    Frame.root.classList.add("titleup");
    if (this.game) this.game.pointer = null;
    this.refreshAuth();
    if (this.authName && !Net.account) {
      try { this.authName.focus({ preventScroll: true }); } catch (e) { try { this.authName.focus(); } catch (e2) {} }
    }
  },

  hideAuth() {
    this.authUp = false;
    Frame.root.classList.remove("authpan");
    Frame.showWorld = false;
    if (this.game) this.game.authPan = false;
    if (this.authLayer) this.authLayer.hidden = true;
    if (!this.up) UI.worldBlocked = false;
  },

  /* The button is the client's "CLICK HERE TO PLAY": it starts the game, and
     does nothing at all until the world behind it is ready to be started - the
     screen comes up while the bakes are still arriving (src/main.js). */
  play() {
    if (!this.ready) return;
    /* Leaving the screen is final (see `show`): from here on it can never come
       back over the game, however late its build promise settles. */
    this._left = true;
    /* The world does not pause for this screen (src/game.js#frame), so sitting
       on it is exactly like sitting on a hidden tab: the sim ticks and the
       socket keeps delivering while nothing is drawn, and the first visible
       frame would replay all of it at once - ghosts gliding in from old tiles,
       a burst of stale poses and graphics. The tab-back fix
       (src/game.js#visibilitychange) drops that backlog instead, and leaving
       here does the same (a second pass runs in main.js#enterWorld for the
       design-screen and name-step flows, which cover the frame again after
       this). */
    if (this.game) {
      this.game.foldBacklog = true;
      if (this.game.resyncForeground) this.game.resyncForeground();
    }
    if (this._onPlay) this._onPlay();
  },

  setReady(ready) {
    this.ready = !!ready;
    if (this.playEl) this.playEl.style.opacity = ready ? "" : "0.65";
    if (ready && this._playQueued) {
      this._playQueued = false;
      const loadingEl = document.getElementById("loading");
      if (loadingEl) {
        loadingEl.style.opacity = "0";
        setTimeout(() => { loadingEl.hidden = true; }, 500);
      }
      this.play();
    }
  },
};
