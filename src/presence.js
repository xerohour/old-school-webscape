/* --------------------------------------------------------------- presence

   The two little counters in the bottom-right corner of the game viewport:

     views  - the platform's own view count for this generator, from the public
              stats API (the same number the generator's listing page shows), so
              it is real rather than a guess
     online - how many people have the world open right now

   The online count comes from the world server (see the
   `<script type="text/x-server-plugin">` element in index.html): every client
   subscribes to the "world" topic and the server re-publishes the number of live
   connections whenever one joins or leaves. This module used to own a socket of
   its own for that - it now *reads* the number off src/net.js's socket instead,
   because two sockets per client was two reconnects per client, and the second
   one bought nothing. A cosmetic counter is never worth an error banner, so
   everything here fails soft: with no server, the line simply stays empty.

   Reconnecting lives in src/net.js now (close codes 1012/1006 retry with capped
   exponential backoff, 4403 - embedded off perchance.org - is permanent, 4429 is
   a quarantine whose retry delay arrives in the reason). */

import { Net } from "./net.js";

const STATS_API = "https://perchance.org/api/getGeneratorStats?names=";

let onlineEl = null;
let authOnlineEl = null;

export function initAuthCounters(viewsEl, online) {
  loadViews(viewsEl);
  authOnlineEl = online || null;
  setOnlineCount(Net.playersOnline || 0);
}

/* Called by src/net.js's counter callback (wired in src/main.js). */
export function setOnlineCount(n) {
  if (onlineEl) {
    onlineEl.hidden = !(n > 0);
    onlineEl.textContent = n > 0 ? n + " online" : "";
    onlineEl.title = Net.rosterList && Net.rosterList.length
      ? Net.rosterList.map((p) => p.name).join(", ")
      : "";
  }
  if (authOnlineEl) authOnlineEl.textContent = n > 0 ? n + " online" : "";
}

/* The account line under the counters: who you are in the world, and nothing
   more - accounts live on the welcome screen now (src/titlescreen.js), so this
   label is never clicked and never opens anything. It is the game's own
   always-visible answer to "am I logged in?". */
export function initPresence(els) {
  if (!els) return;
  loadViews(els.viewCount);
  onlineEl = els.onlineCount || null;
  if (onlineEl) onlineEl.hidden = true;
  setOnlineCount(Net.playersOnline || 0);
}

async function loadViews(el) {
  if (!el) return;
  const name = window.generatorName;
  if (!name) return;
  try {
    const res = await fetch(STATS_API + encodeURIComponent(name));
    if (!res.ok) return;
    const body = await res.json();
    const row = body && body.data && body.data[0];
    if (row && typeof row.views === "number") el.textContent = row.views.toLocaleString("en-US") + " views";
  } catch (err) {
    /* offline, blocked, or the API changed shape: leave the line empty */
  }
}
