/* ===========================================================================
   board.js — the message board's transport and its data.

   The board is a permanent, world-wide chat that outlives every session: every
   post is a comment in a perchance *comments channel* (the comments-plugin), so
   the log is stored by the platform, not by the browser. Anyone who opens the
   game on any device reads the same board.

   Why the plugin is used as a transport rather than as a widget: its feed is
   rendered inside a cross-origin iframe (comments-plugin.perchance.org/embed/…),
   so nothing on this page can reach into a comment's DOM. A copy button on each
   entry, therefore, means drawing the entries here and keeping the plugin for
   what only it can do - the channel itself (reading the backlog, receiving new
   posts live, and posting with the platform's own rate limits, banned-word
   filter and moderation).

   The plugin's own box is kept mounted but invisible (`.boardHost`), which is
   what keeps the socket alive; `submit()` is the posting path, and it goes
   through exactly the same validation as typing into the real box.

   This module owns no interface code. It keeps the message list, knows how to
   turn a comment into safe DOM (`nodesFor`) and plain text (`textFor`, for the
   copy button), and fires `onChange` when the list moves - src/ui.js draws all
   of it in the side panel.

   It also owns the board's **moderation** - the delayed word rule and the
   writer's own controls - which the next section describes.
   =========================================================================== */

const FOLDER = "webscape";
const NOTICE_KEY = "boardNoticeSeen";

/* ---------------------------------------------------------------- moderation

   Two powers over the log, and the one thing they have in common is that both
   live *here*, in the shipped code: every player who opens this game runs the
   same clearing rule, so a message the rule removes is gone from the board for
   everyone who plays it - not just for one browser. (What the rule cannot do is
   delete the comment where it is stored: the platform keeps the channel, and
   the comments plugin's own box is a cross-origin iframe. Real deletion is the
   writer's own login inside that box - see `showRealBox` and the note below.)

   1. The **delayed word rule**. A post containing one of `MOD_WORDS` is not
      refused and not removed on sight: it is *scheduled*, and the sweeper
      clears it fifteen minutes after the moment this browser first saw it. That
      is the writer's own instruction (2026-09-20): *"it should automatically
      remove posts containing [that word] not immediately, but 15 minutes after
      it detects there is a post containing that word"*.
   2. **Writer mode** (see `unlockWriter`), which adds a clear/restore control to
      every entry in the panel and can reveal the plugin's own box, where the
      channel's real delete and ban buttons live.

   Nothing here is secret - it is all public source, and the two hashes below
   are all that stand in front of the writer's controls, so the password they
   are made from is a long random one (see main.pjs) rather than anything a
   person would choose. */

/* The words the delayed rule clears. Plain lowercase words: `modPattern` builds
   the matcher, so letter-swaps, doubling and padding are already accounted for,
   and this list is the whole of it - add a line to ban another word. */
const MOD_WORDS = [
  "nigger",
];

/* Per-browser moderation state: which posts are scheduled and when, and which
   have already been cleared. localStorage rather than the save, because it is
   about the *board* and not about a character - and every browser keeps its own
   schedule, which is exactly what "15 minutes after it detects" means for a post
   that was already there when the browser arrived. */
const MOD_KEY = "osw:boardmod";
const WRITER_KEY = "osw:writer";
/* The writer's own instruction, in milliseconds. */
const MOD_DELAY_MS = 15 * 60 * 1000;
/* How long the sweeper waits between checks. It only ever removes something that
   is already past its due time, so this is a granularity, not a delay: a browser
   that was asleep through a due time clears the post as soon as it wakes. */
const MOD_SWEEP_MS = 20 * 1000;

/* One word as a matcher. Letters that are commonly swapped for digits or
   symbols are accepted either way, and a letter may be doubled (`+`), because
   that is how a word like this gets past a naive filter. The leading
   `(^|[^a-z])` is the important half: it keeps the rule from firing inside a
   longer word that merely contains it (`sniggering`), which is a real word.
   Matching on the message's *text* rather than its html keeps a tag or an
   attribute from ever being part of a match. */
const MOD_SWAPS = {
  a: "[a4@]", e: "[e3]", g: "[gq9]", i: "[i1!|l]", l: "[l1|]",
  o: "[o0]", s: "[s5$]", t: "[t7]", u: "[uuv]", y: "[y]",
};
function modPattern(word) {
  const body = [...word].map((ch) => (MOD_SWAPS[ch] || ch) + "+").join("");
  return new RegExp("(^|[^a-z])" + body, "i");
}
const MOD_MATCHERS = MOD_WORDS.map(modPattern);

/* Does this text carry one of the words? Checked twice: as written, and with
   all whitespace removed, so `n i g g e r` is the same post as `nigger`. The
   boundary guard still applies in the second pass, so removing the spaces
   cannot manufacture a match out of two innocent words. */
function flaggedText(text) {
  const a = String(text || "");
  const b = a.replace(/\s+/g, "");
  for (const re of MOD_MATCHERS) if (re.test(a) || re.test(b)) return true;
  return false;
}

/* SHA-256 of a string, as lowercase hex - what both the writer's gate and the
   comments plugin's `adminPasswordHash` are made of (the plugin prefixes its
   own string, see src/main.pjs). `crypto.subtle` is available in every browser
   this runs in; without it the gate simply stays shut. */
export async function sha256hex(text) {
  const subtle = (typeof crypto !== "undefined" && crypto.subtle) || null;
  if (!subtle) return "";
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* Long boards are trimmed from the old end: the newest MAX_KEPT comments are
   what the panel renders, and older ones are a "load more" press away. */
const MAX_KEPT = 400;

export const BOARD_NOTICE_TITLE = "The Message Board";

/* The board's opening notice. Written by the game's author, and shown twice:
   from the "i" in the board's own title bar, and once, unprompted, to someone
   who has never seen it (the "please tell the AI what to fix" note). */
export const BOARD_NOTICE =
  "Hello, the game engine is in active development. Please help me by posting " +
  "prompts and tasks of specific things that the AI should work on " +
  "improving/fixing/adding in the game engine. I will copy them into the " +
  "coding agent one by one and get it updated. So, if you see something that's " +
  "wrong, write it out in a message. Thank you.";

/* Only images the comments plugin itself can put in a message (custom emoji, and
   its own upload links) are allowed through, and only from perchance's upload
   hosts. Everything else in a comment's html is unwrapped to its text, so a
   message can never bring script, style or a foreign frame onto this origin. */
const ALLOWED_IMG = /^https:\/\/(user\.uploads\.dev|user-uploads\.perchance\.org)\//;
const ALLOWED_HREF = /^https?:\/\//;
const DROP_TAGS = { script: 1, style: 1, iframe: 1, object: 1, embed: 1, link: 1, meta: 1 };

/* "<b>hi</b><script>…" -> an inert document body we can walk. Parsing it in a
   detached document means nothing is fetched or run, whatever a post contains. */
function parseHtml(html) {
  try {
    return new DOMParser().parseFromString("<body>" + String(html == null ? "" : html) + "</body>", "text/html").body;
  } catch (err) {
    const b = document.implementation.createHTMLDocument("").body;
    b.appendChild(document.createTextNode(String(html == null ? "" : html)));
    return b;
  }
}

function copyInto(src, dest) {
  for (const node of src.childNodes) {
    if (node.nodeType === 3) {
      dest.appendChild(document.createTextNode(node.nodeValue));
      continue;
    }
    if (node.nodeType !== 1) continue;
    const tag = node.tagName.toLowerCase();
    if (DROP_TAGS[tag]) continue;
    if (tag === "br") {
      dest.appendChild(document.createElement("br"));
      continue;
    }
    if (tag === "img") {
      const src2 = node.getAttribute("src") || "";
      if (!ALLOWED_IMG.test(src2)) continue;
      const img = document.createElement("img");
      img.src = src2;
      img.alt = node.getAttribute("alt") || "";
      img.title = node.getAttribute("title") || img.alt;
      img.loading = "lazy";
      img.className = "bdEmoji";
      dest.appendChild(img);
      continue;
    }
    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      if (!ALLOWED_HREF.test(href)) {
        copyInto(node, dest);
        continue;
      }
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      copyInto(node, a);
      dest.appendChild(a);
      continue;
    }
    copyInto(node, dest);
  }
}

/* A comment's html as displayable nodes (safe to append straight to a tray). */
export function nodesFor(html) {
  const frag = document.createDocumentFragment();
  copyInto(parseHtml(html), frag);
  return frag;
}

/* The same comment as plain text: what the copy button puts on the clipboard.
   Custom emoji become their `:code:`, a line break becomes a newline, and runs
   of whitespace collapse to one space (the plugin's own feed shows a message on
   one wrapped line, and so does a tray). */
export function textFor(html) {
  const parts = [];
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) parts.push(c.nodeValue);
      else if (c.nodeType === 1) {
        const tag = c.tagName.toLowerCase();
        if (DROP_TAGS[tag]) continue;
        if (tag === "br") parts.push("\n");
        else if (tag === "img") parts.push(c.getAttribute("alt") || c.getAttribute("title") || "");
        else walk(c);
      }
    }
  };
  walk(parseHtml(html));
  return parts.join("").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
}

/* ------------------------------------------------------------------ the board */

function normalize(c) {
  const user = c.user || {};
  const name = (user.nickname || user.name || "").trim();
  return {
    id: String(c.id),
    time: Number(c.time) || Date.now(),
    html: String(c.message == null ? "" : c.message),
    name: name || "anon",
    admin: !!user.isAdmin,
    mine: !!c.byCurrentUser,
    auto: !!c.autoSent,
    replyTo: c.replyingTo ? String(c.replyingTo) : null,
  };
}

export const Board = {
  channel: "",
  status: "idle",       /* idle | connecting | live | error | unavailable */
  error: "",
  messages: [],
  loadMore: null,       /* the plugin's own "load more" button, appended by ui.js */
  host: null,
  com: null,
  _ids: new Set(),
  _listeners: [],
  _mounting: false,

  /* Moderation. `due` is id -> the time the post is to be cleared at, `cleared`
     is id -> the time it was; both are saved (so a reload neither resurrects a
     cleared post nor restarts a countdown) and both are per browser. */
  writer: false,
  due: {},
  cleared: {},
  _writerTries: 0,
  _writerLockedUntil: 0,
  _sweeper: null,

  errors: [],
  _errHooked: false,
  logError(where, err) {
    try {
      const msg = err && err.message ? err.message : String(err);
      const stack = err && err.stack ? String(err.stack).slice(0, 400) : "";
      this.errors.push({ at: Date.now(), where: String(where || ""), msg: String(msg).slice(0, 300), stack });
      if (this.errors.length > 50) this.errors.splice(0, this.errors.length - 50);
      this._fire();
    } catch (e) {}
    return true;
  },

  /* deps: { mount, chat, notice } - the element the invisible plugin box is
     mounted in, the chatbox (for posting errors) and the notice opener (used
     once, for someone who has never read it). */
  init(deps) {
    this.mount = deps.mount || document.body;
    this.chat = deps.chat;
    this.notice = deps.notice;
    this.channel = (typeof root !== "undefined" && root.boardChannel) ? String(root.boardChannel) : "webscape-message-board";
    this.writerHash = (typeof root !== "undefined" && root.writerHash) ? String(root.writerHash) : "";
    this.loadMod();
    this.loadWriter();
    if (!this._errHooked) {
      this._errHooked = true;
      window.addEventListener("error", (ev) => {
        try { this.logError("window", ev.error || ev.message); } catch (e) {}
      });
      window.addEventListener("unhandledrejection", (ev) => {
        try { this.logError("promise", ev.reason); } catch (e) {}
      });
    }
    return this;
  },

  onChange(fn) {
    this._listeners.push(fn);
  },

  _fire() {
    for (const fn of this._listeners.slice()) {
      try {
        fn();
      } catch (err) {
        console.error("board listener failed", err);
      }
    }
  },

  /* Create the channel. Lazy on purpose: a player who never opens the board
     never pays for the iframe or the socket. */
  ensureChannel() {
    if (this.com || this.status === "unavailable" || this._mounting) return this.com;
    if (typeof root === "undefined" || !root.commentsPlugin) {
      this.status = "unavailable";
      this._fire();
      return null;
    }
    this._mounting = true;
    this.status = "connecting";
    this._mount();
    return this.com;
  },

  /* Mount the plugin's box.

     The plugin does not create its iframe when it is called: it returns a marker
     element, swaps that marker for the real box from a MutationObserver, and
     only then builds the iframe - from an IntersectionObserver callback. On a
     page that is not being painted (the editor's preview, a background tab) that
     callback never arrives, and the board would sit on "Connecting to the board
     ..." for ever with nothing in the console to explain it. So the box is
     mounted behind our own observer, which reports every observed element as
     visible - which is what the plugin's box is, since we place it in the
     viewport on purpose. The real observer is put back as soon as the plugin has
     built its iframe (or after a few seconds, whichever comes first), so nothing
     else on the page ever sees the stand-in. */
  _mount() {
    const host = document.createElement("div");
    host.className = "boardHost";
    this.mount.appendChild(host);
    this.host = host;

    const realIO = window.IntersectionObserver;
    const shim = function (cb) {
      const inst = {
        observe(target) {
          setTimeout(() => {
            try {
              cb([{ target, isIntersecting: true, intersectionRatio: 1, boundingClientRect: target.getBoundingClientRect() }], inst);
            } catch (err) {
              console.error("board: lazy-mount callback failed", err);
            }
          }, 0);
        },
        unobserve() {},
        disconnect() {},
        takeRecords() { return []; },
      };
      return inst;
    };
    window.IntersectionObserver = shim;

    let instance = null;
    try {
      instance = root.commentsPlugin({
        channel: this.channel,
        width: 300,
        height: 320,
        forceColorScheme: "dark",
        /* The box is invisible to players (see `.boardHost`), so its chrome is
           only ever seen in the writer's own `::writer box` mode - where the
           settings button is a second way in to the admin login (click it, then
           the Admin tab) alongside the plugin's Ctrl+L shortcut. Fullscreen
           stays hidden: it would take the box out of the host it is mounted in. */
        hideSettingsButton: false,
        hideFullscreenButton: true,
        /* The plugin's own feed is hidden (this panel draws the entries itself),
           and asking for its default order would leave the embed's start-up
           waiting for its message list to become visible - which never happens
           on a page that is not being painted, and which then blocks the
           "finished loading" notice that posting waits for. */
        newestCommentsAtTop: true,
        commentPlaceholderText: "Add a message...",
        /* The writer's admin login, for real deletion and banning inside the
           plugin's own box (see `showRealBox`). Only the hash is here; the
           password is the writer's own and is not in this file. */
        adminPasswordHash: (typeof root !== "undefined" && root.commentsAdminHash) ? String(root.commentsAdminHash) : undefined,
        /* A public board needs a floor under the spam without a moderator
           watching: one post every few seconds, and a rolling ceiling. Hitting
           either rule refuses the post (the plugin reports it back to us). */
        rateLimits: "1 per 4 seconds, 12 per 10 minutes",
        onLoad: (comments, extra) => {
          if (extra && extra.loadMoreButton) this.loadMore = extra.loadMoreButton;
          this._add(comments);
          this.status = "live";
          this._fire();
        },
        onComment: (comment) => {
          this._add([comment]);
          this._fire();
        },
        onLoadMore: (comments) => {
          this._add(comments);
          this._fire();
        },
      });
      host.innerHTML = instance;
    } catch (err) {
      console.error("board: could not mount the comments plugin", err);
      this.error = String(err && err.message ? err.message : err);
      this.status = "error";
      this._fire();
    }

    const restore = () => {
      if (window.IntersectionObserver === shim) window.IntersectionObserver = realIO;
    };
    const poll = setInterval(() => {
      const built = host.firstChild && host.querySelector(".comments-plugin-ctn.already-added-intersection-observer-to-this-comments-plugin-ctn");
      if (built) {
        clearInterval(poll);
        restore();
      }
    }, 50);
    setTimeout(() => {
      clearInterval(poll);
      restore();
    }, 5000);

    this.com = instance;
    this._mounting = false;
    return instance;
  },

  _add(list) {
    if (!list || !list.length) return 0;
    let added = 0;
    let flagged = 0;
    for (const c of list) {
      if (!c || c.id == null) continue;
      const id = String(c.id);
      if (this._ids.has(id)) continue;
      this._ids.add(id);
      const m = normalize(c);
      this.messages.push(m);
      /* first sight of this post in this browser: if it carries a banned word,
         start its countdown. Already-cleared posts stay cleared and posts
         already counting down keep their own clock (a reload is not a reset). */
      if (!this.cleared[id] && !this.due[id] && flaggedText(textFor(m.html))) {
        this.due[id] = Date.now() + MOD_DELAY_MS;
        flagged++;
      }
      added++;
    }
    if (flagged) {
      this.saveMod();
      this._ensureSweeper();
      if (this.writer) {
        /* the writer is told, the countdown is theirs to see - everyone else
           simply finds the post gone when its time is up */
        const when = new Date(Date.now() + MOD_DELAY_MS);
        this.chat("Board moderation: " + flagged + " post" + (flagged === 1 ? "" : "s") +
          " scheduled for clearing at " + when.toTimeString().slice(0, 5) + ".", "warn");
      }
    }
    if (!added) return 0;
    this.messages.sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : 1));
    if (this.messages.length > MAX_KEPT) {
      const drop = this.messages.length - MAX_KEPT;
      for (const m of this.messages.slice(0, drop)) this._ids.delete(m.id);
      this.messages.splice(0, drop);
    }
    return added;
  },

  /* ------------------------------------------------------------- moderation */

  loadMod() {
    try {
      const raw = localStorage.getItem(MOD_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.due && typeof saved.due === "object") this.due = saved.due;
      if (saved && saved.cleared && typeof saved.cleared === "object") this.cleared = saved.cleared;
    } catch (e) { /* private mode */ }
    if (Object.keys(this.due).length) this._ensureSweeper();
  },

  saveMod() {
    try { localStorage.setItem(MOD_KEY, JSON.stringify({ due: this.due, cleared: this.cleared })); }
    catch (e) { /* private mode */ }
  },

  /* The sweep. Runs on a timer rather than a `setTimeout` per post: a countdown
     that spans a reload, a sleeping tab or a closed laptop has to be re-read
     from the wall clock anyway, and this way there is one timer whatever the
     number of posts. */
  _ensureSweeper() {
    if (this._sweeper) return;
    this._sweeper = setInterval(() => this.sweep(), MOD_SWEEP_MS);
    this.sweep();
  },

  sweep() {
    const now = Date.now();
    let changed = false;
    for (const id of Object.keys(this.due)) {
      if (this.due[id] > now) continue;
      delete this.due[id];
      this.cleared[id] = now;
      changed = true;
    }
    if (!changed) {
      /* nothing left counting down: the timer is no longer worth running */
      if (!Object.keys(this.due).length && this._sweeper) { clearInterval(this._sweeper); this._sweeper = null; }
      return 0;
    }
    this.saveMod();
    this._fire();
    return 1;
  },

  isCleared(id) { return !!this.cleared[id]; },
  /* When a scheduled post is due to go, or 0 when it is not scheduled. */
  dueAt(id) { return this.due[id] || 0; },
  pendingCount() { return Object.keys(this.due).length; },
  clearedCount() { return Object.keys(this.cleared).length; },

  /* Take one post off the board - the writer's own control, and what the sweep
     calls when a countdown ends. The post object stays in `messages` (so a
     restore is instant, and so the writer can see what was removed); it is
     `visible` that leaves it out of the panel. A manual clear deliberately does
     *not* cancel the word rule's countdown: `due` is left alone, so restoring a
     flagged post puts it back on its own schedule rather than exempting it, and
     the sweep that ends a countdown is the only thing that drops its `due`
     entry (see `sweep`). */
  clear(id, why) {
    id = String(id);
    if (this.cleared[id]) return false;
    this.cleared[id] = Date.now();
    this.saveMod();
    this._fire();
    if (this.writer && why !== "auto") this.chat("Board moderation: that post is cleared.", "game");
    return true;
  },

  restore(id) {
    id = String(id);
    if (!this.cleared[id]) return false;
    delete this.cleared[id];
    this.saveMod();
    this._fire();
    return true;
  },

  restoreAll() {
    this.cleared = {};
    this.saveMod();
    this._fire();
  },

  /* What the panel draws: every message the writer has not taken off the board.
     (For the writer themselves the panel draws `messages` instead - see
     ui.js#drawBoard - so they can put one back.) */
  visible() {
    return this.messages.filter((m) => !this.cleared[m.id]);
  },

  /* ------------------------------------------------------------- writer mode */

  loadWriter() {
    try {
      this.writer = !!this.writerHash && localStorage.getItem(WRITER_KEY) === this.writerHash;
    } catch (e) { this.writer = false; }
    return this.writer;
  },

  /* Unlock writer mode from a typed password. The password itself is never in
     this code (or anywhere else): only the SHA-256 of it is, so the check is a
     hash comparison, and the browser's own `crypto.subtle` does the work. Five
     wrong tries buy a minute of silence, which is plenty against a typed guess
     and nothing at all against the real password, which is long and random. */
  async unlockWriter(password) {
    if (!this.writerHash) return false;
    if (Date.now() < this._writerLockedUntil) return false;
    const guess = await sha256hex(String(password == null ? "" : password).trim());
    if (guess !== this.writerHash) {
      this._writerTries++;
      if (this._writerTries >= 5) { this._writerTries = 0; this._writerLockedUntil = Date.now() + 60000; }
      return false;
    }
    this._writerTries = 0;
    this.writer = true;
    try { localStorage.setItem(WRITER_KEY, this.writerHash); } catch (e) { /* private mode */ }
    this._fire();
    return true;
  },

  lockWriter() {
    this.writer = false;
    try { localStorage.removeItem(WRITER_KEY); } catch (e) { /* private mode */ }
    this.showRealBox(false);
    this._fire();
  },

  /* The platform's own copy of the board - the comments plugin's box, which is
     mounted but invisible (`.boardHost`). Real deletion and banning live in it:
     the writer clicks it, presses Ctrl+L (Cmd+L) and enters the same writer
     password, and the plugin's own per-comment delete and per-user ban buttons
     appear. This is the only path that removes a comment from the channel
     itself; everything else here removes it from what players of this game see. */
  showRealBox(on) {
    if (!this.host) return false;
    this.host.classList.toggle("boardHostOpen", !!on);
    return true;
  },

  /* Ask the plugin for the previous page of comments. It owns the paging (its
     button carries the request), so this is just a press of that button. */
  loadOlder() {
    if (this.loadMore && !this.loadMore.disabled) this.loadMore.click();
  },

  /* Post. `nickname` signs the message - the board signs posts with the
     character's own name unless the player types another. Resolves on success,
     rejects with the plugin's own reason (rate limit, banned word, ...). */
  async post(text, nickname) {
    const body = String(text == null ? "" : text).trim();
    if (!body) return { success: false, reason: "empty" };
    if (!this.ensureChannel()) throw new Error("the board is unavailable");
    return this.com.submit(body, { nickname: nickname || undefined });
  },

  /* The board's own opening notice, shown once per browser. */
  seenNotice() {
    const store = (typeof root !== "undefined" && root.kv) || null;
    if (!store) return true;
    return store[FOLDER].get(NOTICE_KEY).then((v) => !!v).catch(() => true);
  },

  markNoticeSeen() {
    const store = (typeof root !== "undefined" && root.kv) || null;
    if (!store) return;
    Promise.resolve(store[FOLDER].set(NOTICE_KEY, 1)).catch(() => {});
  },

  /* Show the notice the first time this browser visits. Called once, from
     src/main.js, after the game is up. */
  async maybeShowNotice() {
    if (!this.notice) return false;
    if (await this.seenNotice()) return false;
    this.markNoticeSeen();
    this.notice();
    return true;
  },

  /* A one-line reason from a rejected post, for the chatbox. */
  reasonFor(err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/rate|too (many|fast)|wait/i.test(msg)) return msg;
    if (!msg) return "the board refused that message";
    return msg;
  },
};
