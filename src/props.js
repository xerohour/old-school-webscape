/* SEVER (object-picker): the hand-authoring object picker lives in this
   file plus the `::props` case in ui.js/command and the data in
   src/data/loc-usage.json, loc-structures.json, loc-grammars.json,
   loc-clusters.json, loc-genres.json, region-places.json and map-labels.json.
   The `case "prop"` seams in scene.js/_locSpec (draw), world.js/isWalkable
   (solidity) and actions.js/objName+objExamine (name/examine) are shared with
   src/handplaced.js, which stamps exported placements at boot - those stay
   when the picker goes. Stamps live only in the writer's session until
   exported to src/data/hand-placed.json. */

import { Board } from "./board.js";
import { fetchBakedJSON } from "./baked.js";
import { hasLoc, locFootprint, locsReady } from "./locmodels.js";

const GENRE_KEY = "osw:propsGenres";
const PLACE_KEY = "osw:propsPlacements";
const EDIT_KEY = "osw:propsEdits";
const GENRES = ["misthalin", "asgarnia", "desert", "wilderness", "karamja", "fremennik", "morytania", "troll", "kandarin", "tirannwn", "kourend", "feldip", "mosleharmless", "lunar", "apeatoll", "fossil", "kebos", "souls", "desertisland", "universal", "unassigned"];

let panel = null;
let S = null;
let dataCache = null;

function loadGenres() {
  try {
    const g = JSON.parse(localStorage.getItem(GENRE_KEY) || "{}");
    return g && typeof g === "object" ? g : {};
  } catch (e) { return {}; }
}
function saveGenres(g) {
  try { localStorage.setItem(GENRE_KEY, JSON.stringify(g)); } catch (e) {}
}
function genreOf(g, id) {
  for (const [name, ids] of Object.entries(g)) if (ids.includes(id)) return name;
  return null;
}
/* SEVER (object-picker): effective genre = the writer's tray tag if any, else
   the auto-pass suggestion from src/data/loc-genres.json, else unassigned. */
function autoGenre(id) {
  return (S.autoGenres && S.autoGenres[id] && S.autoGenres[id].g) || "unassigned";
}
function autoWhy(id) {
  return (S.autoGenres && S.autoGenres[id] && S.autoGenres[id].conf + ": " + S.autoGenres[id].why) || "";
}
function effGenre(id) {
  return genreOf(S.genres, id) || autoGenre(id);
}
const LAY_KEY = "osw:propsLayout";
function loadLayout() {
  try {
    const l = JSON.parse(localStorage.getItem(LAY_KEY) || "{}");
    return l && typeof l === "object" ? l : {};
  } catch (e) { return {}; }
}
function makeGrab(key, target, min, max) {
  const g = document.createElement("div");
  g.className = "ppGrab";
  g.title = "drag to resize";
  if (S.layout[key]) { target.style.height = S.layout[key] + "px"; target.style.maxHeight = S.layout[key] + "px"; }
  g.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try { g.setPointerCapture(e.pointerId); } catch (err) {}
    const y0 = e.clientY;
    const h0 = target.getBoundingClientRect().height;
    const move = (ev) => {
      target.style.flex = "0 0 auto";
      const h = Math.min(max, Math.max(min, Math.round(h0 + ev.clientY - y0)));
      target.style.height = h + "px";
      target.style.maxHeight = h + "px";
    };
    const up = () => {
      g.removeEventListener("pointermove", move);
      g.removeEventListener("pointerup", up);
      g.removeEventListener("pointercancel", up);
      S.layout[key] = Math.round(target.getBoundingClientRect().height);
      try { localStorage.setItem(LAY_KEY, JSON.stringify(S.layout)); } catch (err) {}
    };
    g.addEventListener("pointermove", move);
    g.addEventListener("pointerup", up);
    g.addEventListener("pointercancel", up);
  });
  return g;
}
function loadPlacements() {
  try {
    const p = JSON.parse(localStorage.getItem(PLACE_KEY) || "[]");
    return Array.isArray(p) ? p : [];
  } catch (e) { return []; }
}
function savePlacements(list) {
  try { localStorage.setItem(PLACE_KEY, JSON.stringify(list)); } catch (e) {}
}
function loadEdits() {
  try {
    const p = JSON.parse(localStorage.getItem(EDIT_KEY) || "[]");
    return Array.isArray(p) ? p : [];
  } catch (e) { return []; }
}
function saveEdits(list) {
  try { localStorage.setItem(EDIT_KEY, JSON.stringify(list)); } catch (e) {}
}

function ensureCss() {
  if (document.getElementById("ppCss")) return;
  const st = document.createElement("style");
  st.id = "ppCss";
  st.textContent =
    ".pp{position:fixed;top:8px;right:8px;width:352px;max-height:calc(100vh - 16px);display:flex;flex-direction:column;overflow-y:auto;background:#1a140d;color:#e8dcc0;border:2px solid #5a4a2f;font:12px/1.35 monospace;z-index:999;}" +
    ".ppHd{display:flex;align-items:center;gap:6px;padding:4px 6px;background:#2c2317;font-weight:bold;}" +
    ".ppHd button{margin-left:auto;background:none;border:none;color:#e8dcc0;cursor:pointer;font:inherit;}" +
    ".ppBar{display:flex;gap:4px;padding:4px 6px;align-items:center;flex-wrap:wrap;}" +
    ".ppBar input[type=text]{flex:1;min-width:80px;background:#0f0c08;color:#e8dcc0;border:1px solid #5a4a2f;font:inherit;padding:2px 4px;}" +
    ".ppBar select{background:#0f0c08;color:#e8dcc0;border:1px solid #5a4a2f;font:inherit;}" +
    ".ppBar label{display:flex;gap:3px;align-items:center;}" +
    ".ppList{overflow-y:auto;max-height:220px;border-top:1px solid #5a4a2f;border-bottom:1px solid #5a4a2f;}" +
    ".ppRow{display:flex;gap:6px;padding:2px 6px;cursor:pointer;white-space:nowrap;overflow:hidden;}" +
    ".ppRow:nth-child(odd){background:#211a11;}" +
    ".ppRow.sel{background:#4a3a1f;}" +
    ".ppDot{width:8px;height:8px;border-radius:50%;margin-top:4px;flex:none;}" +
    ".ppDet{padding:4px 6px;overflow-y:auto;max-height:200px;border-bottom:1px solid #5a4a2f;}" +
    ".ppDet .t{font-weight:bold;color:#ffe9a8;}" +
    ".ppDet .d{color:#b8a888;}" +
    ".ppBtns{display:flex;gap:4px;padding:4px 6px;flex-wrap:wrap;overflow-y:auto;}" +
    ".ppBtns button{background:#2c2317;color:#e8dcc0;border:1px solid #5a4a2f;font:inherit;padding:2px 6px;cursor:pointer;}" +
    ".ppBtns button:hover{background:#4a3a1f;}" +
     ".ppGrab{flex:none;height:9px;cursor:ns-resize;background:repeating-linear-gradient(90deg,#5a4a2f 0 10px,#241d12 10px 20px);border-top:1px solid #5a4a2f;border-bottom:1px solid #5a4a2f;touch-action:none;}" +
     ".ppGrab:hover{background:repeating-linear-gradient(90deg,#8a734f 0 10px,#3a2d1a 10px 20px);}" +
    ".ppTrays{padding:2px 4px;border-top:1px solid #5a4a2f;overflow-y:auto;max-height:300px;}" +
     ".ppSec{margin-bottom:2px;}" +
     ".ppSecHd{display:flex;gap:6px;padding:2px 4px;cursor:pointer;white-space:nowrap;overflow:hidden;}" +
     ".ppSecHd.filt{background:#4a3a1f;}" +
     ".ppSecHd.over{background:#6a532f;}" +
     ".ppTri{flex:none;width:14px;color:#ffe9a8;}" +
     ".ppSecBd{margin-left:16px;border-left:1px solid #5a4a2f;max-height:180px;overflow-y:auto;}" +
     ".ppClu{padding:1px 4px 1px 6px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
     ".ppClu:nth-child(odd){background:#1e1810;}" +
     ".ppClu:hover{background:#4a3a1f;}" +
     ".ppClu.sel{background:#4a3a1f;font-weight:bold;}" +
     ".ppClu.none{cursor:default;color:#b8a888;}" +
     ".ppDet .site{cursor:pointer;}" +
     ".ppDet .site:hover{background:#4a3a1f;}" +
    ".ppHint{padding:3px 6px;color:#b8a888;border-top:1px solid #5a4a2f;}" +
     ".ppSecLbl{padding:3px 6px 0;color:#8a7757;font-size:10px;letter-spacing:2px;}" +
     ".ppMem{margin:1px 0 3px 20px;border-left:1px solid #5a4a2f;max-height:220px;overflow-y:auto;}" +
     ".ppMemRow{display:flex;gap:6px;padding:1px 4px 1px 6px;cursor:pointer;white-space:nowrap;overflow:hidden;}" +
     ".ppMemRow:hover{background:#4a3a1f;}";
  document.head.appendChild(st);
}

function copyText(text, chat, okMsg) {
  const done = () => chat(okMsg, "game");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, chat, okMsg));
  } else fallbackCopy(text, chat, okMsg);
}
function fallbackCopy(text, chat, okMsg) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:0;left:0;width:10px;height:10px;opacity:0.01;";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); chat(okMsg, "game"); }
  catch (e) { chat("Copy failed - select the text manually.", "warn"); }
  ta.remove();
}

export async function openProps(ctx) {
  if (!ctx || typeof ctx.chat !== "function") {
    try {
      const ui = await import("./ui.js");
      ctx = { ...(ctx || {}), chat: (m, k) => ui.chat(m, k) };
    } catch (e) { return; }
  }
  if (!Board.writer) { ctx.chat("Writer mode first: ::writer", "warn"); return; }
  ensureCss();
  if (panel) { panel.hidden = false; panel.focus(); return; }
  ctx.chat("Loading the usage index...", "game");
  let usage, structs, grams, menus, places, auto, clu;
  try {
    if (!dataCache) {
      dataCache = Promise.all([
        fetchBakedJSON("src/data/loc-usage.json"),
        fetchBakedJSON("src/data/loc-structures.json"),
        fetchBakedJSON("src/data/loc-grammars.json"),
        fetchBakedJSON("src/data/loc-cache-menus.json"),
        fetchBakedJSON("src/data/region-places.json"),
        fetchBakedJSON("src/data/loc-genres.json"),
        fetchBakedJSON("src/data/loc-clusters.json"),
      ]);
      dataCache.catch(() => { dataCache = null; });
    }
    [usage, structs, grams, menus, places, auto, clu] = await dataCache;
  } catch (e) {
    ctx.chat("Could not load the picker data.", "warn");
    return;
  }
  const ids = usage.ids || usage;
  const structById = new Map();
  for (const it of structs.items || []) structById.set(it.id, it);
  const keyByLoc = {};
  for (const [key, def] of Object.entries(menus)) {
    if (def.locId != null && !keyByLoc[def.locId]) keyByLoc[def.locId] = { key, def };
  }
  /* SEVER (object-picker): the community map join. Every loc inherits the
     Jagex world-map labels (explv map_labels via src/data/region-places.json)
     of the regions it was decoded in: exact kingdom/town/local names, or the
     nearest label with its distance when nothing is close. */
  const pmap = (places && places.places) || {};
  const placeOf = (e) => {
    const kc = new Map(), tc = new Map(), lc = new Map(), nc = new Map();
    for (const r of [...(e.r241 || []), ...(e.r21 || [])]) {
      const p = pmap[r];
      if (!p) continue;
      if (p.k) kc.set(p.k, (kc.get(p.k) || 0) + 1);
      for (const t of p.t || []) tc.set(t.name, (tc.get(t.name) || 0) + 1);
      for (const x of p.l || []) lc.set(x.name, (lc.get(x.name) || 0) + 1);
      if (p.near) {
        const cur = nc.get(p.near.name);
        if (!cur || p.near.d < cur.d) nc.set(p.near.name, p.near);
      }
    }
    const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => name);
    const near = [...nc.values()].sort((a, b) => a.d - b.d).slice(0, 2);
    const sum = { k: top(kc, 2), t: top(tc, 4), l: top(lc, 4), near };
    const blob = [...sum.k, ...sum.t, ...sum.l, ...near.map((x) => x.name)].join(" ").toLowerCase();
    return { sum, blob };
  };
  const all = Object.keys(ids).map((id) => {
    const e = ids[id];
    const b = keyByLoc[Number(id)] || keyByLoc[id] || null;
    const pl = placeOf(e);
    return {
      id: Number(id), name: e.name || e.name21 || null, n: e.n || 0,
      tiles: e.tiles || [], struct: e.struct || [], land: e.land || [],
      regs: (e.r241 || []).length + (e.r21 || []).length,
      baked: b ? b.key : null, def: b ? b.def : null,
      place: pl.sum, placeBlob: pl.blob,
    };
  });
  S = {
    ctx, all, structById, grams: grams.items || [], genres: loadGenres(),
    autoGenres: (auto && auto.genres) || {},
    clusters: (clu && clu.clusters) || [], cluById: {}, cluByGenre: (clu && clu.byGenre) || {},
    locClu: {},
    q: "", bakedOnly: true, genreFilt: "", clusterFilt: null, expanded: {}, expandedSite: {}, layout: loadLayout(), byId: {},
    results: [], sel: 0,
    anchor: null, rot: 0, ghostTiles: [], stamped: new Set(), placements: loadPlacements(),
    grabMode: false, grab: null, carry: null, edits: loadEdits(),
    mouse: null, mouseTile: null, followWarnAt: null,
  };
  /* SEVER (object-picker): the clustered-coordinates subsections. Every loc
     knows the numbered sites (MIS-001...) it was seen at; every site knows its
     member locs. Sites come from src/data/loc-clusters.json. */
  for (const s of S.clusters) S.cluById[s.id] = s;
  for (const s of S.clusters) {
    for (const lid of s.locs || []) {
      let a = S.locClu[lid];
      if (!a) { a = []; S.locClu[lid] = a; }
      if (a.length < 8 && !a.includes(s.id)) a.push(s.id);
    }
  }
  for (const e of S.all) S.byId[e.id] = e;
  for (const e of S.all) {
    const bits = [];
    for (const cid of S.locClu[e.id] || []) {
      const s = S.cluById[cid];
      if (s) bits.push((s.id + " " + s.label + " " + (s.local ? s.local.name : "") + " " + (s.town ? s.town.name : "")).toLowerCase());
    }
    e.cluBlob = bits.join(" ");
  }
  buildPanel();
  refilter();
  /* Mouse tracking for ghost-carry: the preview follows the cursor, not the
     writer's feet. Left-click while carrying sets the original down. */
  if (!S.mouseTrack) {
    S.mouseTrack = (e) => { if (S) S.mouse = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointermove", S.mouseTrack, true);
  }
  /* The ghost trails the writer: every 350ms, if they walked >3 tiles since
     the anchor was set, re-place the ghost near them (placeGhost re-checks
     the distance itself and no-ops otherwise). Without this the ghost sits
     where it first landed and Enter stamps it behind you. */
  if (S.followTimer) clearInterval(S.followTimer);
  S.followTimer = setInterval(() => {
    try {
      if (!panel || panel.hidden || !S || !S.ctx || !S.ctx.player) return;
      const px = Math.floor(S.ctx.player.x), pz = Math.floor(S.ctx.player.z);
      if (!S.ghostTiles.length && !S.anchor && !S.carry) return;
      const e = S.results[S.sel];
      if (!e || !e.baked) return;
      /* Ghost-carry is mouse-driven: the preview follows the cursor. */
      if (S.carry) {
        if (!S.mouse) return;
        let h = null;
        try { h = window.Game.pickTile(S.mouse.x, S.mouse.y); } catch (err) { return; }
        if (!h) return;
        const fp = footOf(e);
        const ax = h.tx - Math.floor(fp[0] / 2), az = h.tz - Math.floor(fp[1] / 2);
        const key = ax + "," + az;
        if (key === S.mouseTile) return;
        /* Vet before clearing: never dissolve a standing ghost into nothing. */
        let fits = true;
        for (let dz = 0; dz < fp[1] && fits; dz++) {
          for (let dx = 0; dx < fp[0] && fits; dx++) {
            if (!S.ctx.world.inBounds(ax + dx, az + dz)) fits = false;
            else {
              const o = S.ctx.world.objAt(ax + dx, az + dz);
              if (o && !(o.t === "prop" && o.ghost)) fits = false;
              /* Same bar as the followSpot path: terrain must be walkable
                 (this is what keeps wrecks off water and out of walls). */
              else if (S.ctx.world.walkableTile && !S.ctx.world.walkableTile(ax + dx, az + dz)) fits = false;
            }
          }
        }
        if (!fits) {
          if (!S.mouseWarnAt || Math.abs(h.tx - S.mouseWarnAt.x) + Math.abs(h.tz - S.mouseWarnAt.z) > 5) {
            S.mouseWarnAt = { x: h.tx, z: h.tz };
            S.ctx.chat("No room for the ghost there.", "warn");
          }
          return;
        }
        S.mouseTile = key;
        placeGhost(ax, az);
        return;
      }
      const af = S.anchorFrom;
      /* Nudge-friendly: ANY change of the writer's tile re-anchors the ghost,
         so precise 1-tile positioning steps drag the preview along. A full
         re-place is two 16x16 chunk rebuilds (~ms), cheap at 350ms ticks. */
      if (!af || px !== af.x || pz !== af.z) {
        /* Auto-follow never clears a standing ghost into nothing: if no free
           spot is near, the preview holds position and says so (throttled). */
        const spot = followSpot(footOf(e));
        if (spot) placeGhost();
        else if (!S.followWarnAt || Math.abs(px - S.followWarnAt.x) + Math.abs(pz - S.followWarnAt.z) > 6) {
          S.followWarnAt = { x: px, z: pz };
          S.ctx.chat("No free room for the ghost near you - walk to open ground.", "warn");
        }
      }
    } catch (err) {}
  }, 350);
  ctx.chat("Object picker open: " + all.length + " locs, " + all.filter((e) => e.baked).length + " baked.", "game");
}

function matchEntry(e, q) {
  if (!q) return true;
  const g = S.genres;
  if (q.startsWith("area:")) {
    const want = q.slice(5);
    if ((e.placeBlob || "").includes(want)) return true;
    return e.struct.some((sid) => {
      const st = S.structById.get(sid);
      return st && (st.a || "").includes(want);
    });
  }
  if ((e.name || "").toLowerCase().includes(q)) return true;
  if (String(e.id).includes(q)) return true;
  if ((e.baked || "").includes(q)) return true;
  if ((e.placeBlob || "").includes(q)) return true;
  if ((e.cluBlob || "").includes(q)) return true;
  return effGenre(e.id) === q;
}

function refilter() {
  const q = S.q.trim().toLowerCase();
  const inClu = S.clusterFilt && S.cluById[S.clusterFilt] ? new Set(S.cluById[S.clusterFilt].locs) : null;
  S.results = S.all.filter((e) => {
    if (inClu && !inClu.has(e.id)) return false;
    if (S.bakedOnly && !e.baked) return false;
    if (S.genreFilt && effGenre(e.id) !== S.genreFilt) return false;
    return matchEntry(e, q);
  }).sort((a, b) => b.n - a.n);
  S.sel = Math.min(S.sel, Math.max(0, S.results.length - 1));
  select(S.sel);
}

function el(tag, cls, text) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text != null) d.textContent = text;
  return d;
}

function buildPanel() {
  panel = el("div", "pp");
  panel.tabIndex = 0;
  const hd = el("div", "ppHd", "Object picker");
  const x = el("button", null, "X");
  x.addEventListener("click", closeProps);
  hd.appendChild(x);
  panel.appendChild(hd);
  const bar = el("div", "ppBar");
  const q = el("input");
  q.type = "text";
  q.placeholder = "search name / id / key / place (area:slug)";
  q.addEventListener("input", () => { S.q = q.value; S.sel = 0; refilter(); });
  S.qInput = q;
  bar.appendChild(q);
  const baked = el("label");
  const bc = el("input");
  bc.type = "checkbox";
  bc.checked = true;
  bc.addEventListener("change", () => { S.bakedOnly = bc.checked; refilter(); });
  S.bakedCb = bc;
  baked.appendChild(bc);
  baked.appendChild(document.createTextNode("baked"));
  bar.appendChild(baked);
  const gf = el("select");
  gf.appendChild(new Option("all genres", ""));
  { const bc = {};
    for (const e of S.all) if (e.baked) bc[effGenre(e.id)] = (bc[effGenre(e.id)] || 0) + 1;
    for (const gname of GENRES) {
      let n = 0; for (const e of S.all) if (effGenre(e.id) === gname) n++;
      gf.appendChild(new Option(gname + " (" + n + ", " + (bc[gname] || 0) + " baked)", gname));
    } }
  gf.addEventListener("change", () => { S.genreFilt = gf.value; refilter(); });
  bar.appendChild(gf);
  panel.appendChild(el("div", "ppSecLbl", "1 FIND"));
  panel.appendChild(bar);
  S.listEl = el("div", "ppList");
  S.listEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    step(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  S.lblRes = el("div", "ppSecLbl", "2 RESULTS");
  panel.appendChild(S.lblRes);
  panel.appendChild(S.listEl);
  panel.appendChild(makeGrab("list", S.listEl, 60, 520));
  S.detEl = el("div", "ppDet");
  panel.appendChild(el("div", "ppSecLbl", "3 DETAIL"));
  panel.appendChild(S.detEl);
  panel.appendChild(makeGrab("det", S.detEl, 60, 420));
  const btns = el("div", "ppBtns");
  S.btnsEl = btns;
  const mkBtn = (label, fn) => {
    const b = el("button", null, label);
    b.addEventListener("click", () => { fn(); b.blur(); });
    btns.appendChild(b);
    return b;
  };
  mkBtn("Stamp (Enter)", () => doStamp());
  mkBtn("Rotate (R)", () => actRotate());
  mkBtn("Pick up (M)", () => actPickup());
  mkBtn("Delete (Del)", () => actDelete());
  mkBtn("Re-anchor (G)", () => { S.anchor = null; placeGhost(); });
  grabBtnEl = mkBtn("Grab placed (B)", () => toggleGrabMode());
  mkBtn("Copy placements", exportPlacements);
  mkBtn("Copy edits", exportEdits);
  mkBtn("Copy bake queue", exportQueue);
  mkBtn("Copy genres", exportGenres);
  mkBtn("Clear placed", () => { S.placements = []; savePlacements(S.placements); S.ctx.chat("Placement list cleared (stamped objects stay in this session).", "game"); });
  panel.appendChild(el("div", "ppSecLbl", "4 ACTIONS"));
  panel.appendChild(btns);
  panel.appendChild(makeGrab("btns", S.btnsEl, 30, 220));
  S.trayEl = el("div", "ppTrays");
  panel.appendChild(el("div", "ppSecLbl", "5 GENRE SITES"));
  panel.appendChild(S.trayEl);
  panel.appendChild(makeGrab("trays", S.trayEl, 80, 620));
  const hint = el("div", "ppHint", "search name/id/key/place (area:slug) - genre list or \u00A75 narrows - arrows pick, ghost follows, Enter stamps - B grabs a placed piece: click it, R rotates, M ghost-carries (original hidden, follows mouse, click sets down), Del deletes, Esc backs out (grab, then carry, then grab mode)");
  panel.appendChild(hint);
  if (!propsKeysOn) { document.addEventListener("keydown", propsKeys, true); propsKeysOn = true; }
  document.body.appendChild(panel);
  panel.focus();
  renderTrays();
}

function renderTrays() {
  S.trayEl.innerHTML = "";
  const eff = {};
  const bakedCt = {};
  for (const e of S.all) { const g = effGenre(e.id); eff[g] = (eff[g] || 0) + 1; if (e.baked) bakedCt[g] = (bakedCt[g] || 0) + 1; }
  const KIND = { district: "D", building: "B", site: "S", landmark: "L", scatter: "~" };
  GENRES.forEach((gname, i) => {
    const count = eff[gname] || 0;
    const sites = (S.cluByGenre[gname] || []).map((id) => S.cluById[id]).filter(Boolean);
    const sec = el("div", "ppSec");
    const hd = el("div", "ppSecHd" + (S.genreFilt === gname ? " filt" : ""));
    const tri = el("span", "ppTri", S.expanded[gname] ? "\u25BC" : "\u25B6");
    tri.title = "expand " + sites.length + " clustered sites";
    tri.addEventListener("click", (ev) => {
      ev.stopPropagation();
      S.expanded[gname] = !S.expanded[gname];
      renderTrays();
    });
    hd.appendChild(tri);
    const nm = el("span", null, (i < 9 ? (i + 1) + ":" : "") + gname + " (" + count + " \u00B7 " + (bakedCt[gname] || 0) + " baked \u00B7 " + sites.length + " sites)");
    nm.addEventListener("click", () => { S.genreFilt = S.genreFilt === gname ? "" : gname; S.clusterFilt = null; renderTrays(); refilter(); });
    hd.appendChild(nm);
    hd.addEventListener("dragover", (e) => { e.preventDefault(); hd.classList.add("over"); });
    hd.addEventListener("dragleave", () => hd.classList.remove("over"));
    hd.addEventListener("drop", (e) => {
      e.preventDefault();
      hd.classList.remove("over");
      const id = Number(e.dataTransfer.getData("text/plain"));
      if (id) setGenre(id, gname);
    });
    sec.appendChild(hd);
    if (S.expanded[gname]) {
      const bd = el("div", "ppSecBd");
      if (!sites.length) bd.appendChild(el("div", "ppClu none", "no sites yet"));
      for (const s of sites.slice(0, 400)) {
        const w = s.local && s.local.d < 150 ? s.local.name : (s.town ? s.town.name : (s.near ? s.near.name : "?"));
        const r = el("div", "ppClu" + (S.clusterFilt === s.id ? " sel" : ""));
        const st = el("span", "ppTri", S.expandedSite[s.id] ? "\u25BC" : "\u25B6");
        st.title = "list all " + s.locs.length + " member locs";
        st.addEventListener("click", (ev) => {
          ev.stopPropagation();
          S.expandedSite[s.id] = !S.expandedSite[s.id];
          renderTrays();
        });
        r.appendChild(st);
        const siteNm = el("span", null, s.id + " " + (KIND[s.kind] || "?") + " " + s.label + " \u00B7 c(" + s.c[0] + "," + s.c[1] + ") \u03C3" + s.std + " \u00B7 " + s.locs.length + " types");
        siteNm.title = s.kind + " near " + w + " [" + s.area + "] - click to list its locs in section 2";
        siteNm.addEventListener("click", () => {
          S.clusterFilt = S.clusterFilt === s.id ? null : s.id;
          if (S.clusterFilt) S.genreFilt = s.g;
          refilter();
          renderTrays();
        });
        r.appendChild(siteNm);
        r.title = s.kind + " near " + w + " [" + s.area + "]";
        bd.appendChild(r);
        /* SEVER (object-picker): the site's own dropdown - every member loc
           it points at, baked or not. A member click points section 2 at it. */
        if (S.expandedSite[s.id]) {
          const mem = el("div", "ppMem");
          for (const lid of s.locs) {
            const e2 = S.byId[lid];
            const m = el("div", "ppMemRow");
            const dot = el("div", "ppDot");
            dot.style.background = e2 && e2.baked ? "#5fd45f" : "#777";
            m.appendChild(dot);
            m.appendChild(el("span", null, ((e2 && e2.name) || "Unnamed loc") + " #" + lid + (e2 && e2.baked ? "" : " (unbaked)")));
            m.title = (e2 && e2.baked ? e2.baked + " - " : "not baked - ") + "click to show in section 2";
            m.addEventListener("click", (ev) => {
              ev.stopPropagation();
              S.clusterFilt = null;
              if (e2 && !e2.baked && S.bakedCb) { S.bakedOnly = false; S.bakedCb.checked = false; }
              S.q = String(lid);
              if (S.qInput) S.qInput.value = S.q;
              S.sel = 0;
              S.expanded[s.g] = true;
              refilter();
              renderTrays();
            });
            mem.appendChild(m);
          }
          bd.appendChild(mem);
        }
      }
      sec.appendChild(bd);
    }
    S.trayEl.appendChild(sec);
  });
}

function setGenre(id, gname) {
  const g = S.genres;
  for (const k of Object.keys(g)) g[k] = (g[k] || []).filter((v) => v !== id);
  if (gname !== "unassigned") {
    if (!g[gname]) g[gname] = [];
    g[gname].push(id);
  }
  saveGenres(g);
  renderTrays();
  renderList();
  renderDetail();
  S.ctx.chat("Loc " + id + " -> " + gname + ".", "game");
}

function step(d) {
  if (!S.results.length) return;
  select((S.sel + d + S.results.length) % S.results.length);
}

function select(i) {
  S.sel = i;
  renderList();
  renderDetail();
  /* The ghost follows through a short trailing debounce, so typing a search
     or scrolling the list never rebuilds the world per keystroke/step - it
     lands once, just after you stop. stamp/rotate/re-anchor flush it
     (placeGhostNow) so they always act on a current ghost. */
  placeGhostSoon();
}

let ghostTimer = 0;
function rebuildTiles(tiles) {
  if (!S || !tiles || !tiles.length) return;
  const seen = new Set(), v = S.ctx.view;
  for (const [x, z] of tiles) {
    const k = Math.floor(x / 16) + "," + Math.floor(z / 16);
    if (seen.has(k)) continue;
    seen.add(k);
    v.rebuildChunkAt(x, z);
  }
}
function placeGhostSoon() {
  clearTimeout(ghostTimer);
  ghostTimer = setTimeout(placeGhost, 150);
}
function placeGhostNow() {
  clearTimeout(ghostTimer);
  ghostTimer = 0;
  placeGhost();
}

function renderList() {
  const L = S.listEl;
  L.innerHTML = "";
  if (S.lblRes) S.lblRes.textContent = "2 RESULTS (" + S.results.length + ")";
  for (let i = 0; i < Math.min(150, S.results.length); i++) {
    const e = S.results[i];
    const r = el("div", "ppRow" + (i === S.sel ? " sel" : ""));
    r.draggable = true;
    r.addEventListener("dragstart", (ev) => ev.dataTransfer.setData("text/plain", String(e.id)));
    const dot = el("div", "ppDot");
    dot.style.background = e.baked ? "#5fd45f" : "#777";
    r.appendChild(dot);
    r.appendChild(el("span", null, (e.name || "Unnamed loc " + e.id) + " #" + e.id + " x" + e.n));
    r.title = effGenre(e.id);
    const ix = i;
    r.addEventListener("click", () => select(ix));
    r.addEventListener("dblclick", () => { select(ix); stamp(); });
    L.appendChild(r);
    if (i === S.sel) r.scrollIntoView({ block: "nearest" });
  }
  if (S.results.length > 150) L.appendChild(el("div", "ppRow", "... " + (S.results.length - 150) + " more - refine the search"));
  if (!S.results.length) {
    let msg = "no matches";
    if (S.clusterFilt && S.cluById[S.clusterFilt]) {
      const s = S.cluById[S.clusterFilt];
      msg = s.id + " holds " + s.locs.length + " locs" + (S.bakedOnly ? ", none baked - uncheck baked to list them" : "");
    } else if (S.bakedOnly) {
      /* The usual dead end: the genre HAS locs, just none baked yet. Count
         what the baked filter is hiding and say so, instead of "no matches". */
      const q = S.q.trim().toLowerCase();
      const inClu = S.clusterFilt && S.cluById[S.clusterFilt] ? new Set(S.cluById[S.clusterFilt].locs) : null;
      let hidden = 0;
      for (const e of S.all) {
        if (e.baked) continue;
        if (inClu && !inClu.has(e.id)) continue;
        if (S.genreFilt && effGenre(e.id) !== S.genreFilt) continue;
        if (matchEntry(e, q)) hidden++;
      }
      msg = hidden ? (hidden + " unbaked hidden by the baked filter - uncheck baked to browse, Copy bake queue to bake them") : "no matches (try unchecking baked)";
    }
    L.appendChild(el("div", "ppRow", msg));
  }
}

function areasOf(e) {
  const m = new Map();
  for (const sid of e.struct) {
    const st = S.structById.get(sid);
    if (!st) continue;
    const a = (st.a || "region-" + st.r) + "";
    m.set(a, (m.get(a) || 0) + ((st.locs || {})[e.id] || 0));
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function renderDetail() {
  const D = S.detEl;
  D.innerHTML = "";
  const e = S.results[S.sel];
  if (!e) { D.appendChild(el("div", "d", "nothing selected")); return; }
  D.appendChild(el("div", "t", (e.name || "Unnamed loc") + "  #" + e.id));
  D.appendChild(el("div", "d", "used x" + e.n + " in " + e.regs + " regions - genre: " + effGenre(e.id) + " (auto: " + autoGenre(e.id) + (autoWhy(e.id) ? " " + autoWhy(e.id) : "") + ")"));
  /* SEVER (object-picker): the map line - kingdom, towns, local labels, then
     the nearest label with its distance when nothing exact is close. */
  {
    const bits = [];
    if (e.place.k.length) bits.push(e.place.k.join(" / "));
    if (e.place.t.length) bits.push(e.place.t.join(", "));
    if (e.place.l.length) bits.push(e.place.l.join(", "));
    for (const x of e.place.near) bits.push("~" + x.name + " (" + x.d + "t)");
    D.appendChild(el("div", null, "map: " + (bits.length ? bits.join(" - ") : "unknown")));
  }
  if (e.baked) {
    const acts = (e.def.actions || []).filter((a) => a && a !== "hidden");
    D.appendChild(el("div", null, "baked: " + e.baked + " " + (e.def.sizeX || 1) + "x" + (e.def.sizeY || 1) + (e.def.solid ? " solid" : " walkable")));
    if (acts.length) D.appendChild(el("div", "d", "verbs: " + acts.join(" / ")));
    if (S.carry) D.appendChild(el("div", null, "CARRYING ghost of " + S.carry.key + " (original hidden @ " + S.carry.origOx + "," + S.carry.origOz + ")" + (S.anchor ? " ghost @ " + S.anchor.x + "," + S.anchor.z + " rot " + S.rot : " (no ghost standing)") + " - follows mouse, click or Enter sets down, Esc restores"));
    D.appendChild(el("div", null, "ghost rot " + S.rot + (S.anchor ? " @ " + S.anchor.x + "," + S.anchor.z : " (follows player)")));
    if (S.grabMode) D.appendChild(el("div", null, "GRAB " + (S.grab ? S.grab.key + " @ " + S.grab.ox + "," + S.grab.oz + " (R/M/Del/Esc)" : "armed - click a placed piece")));
  } else {
    D.appendChild(el("div", null, "NOT BAKED - queue it below to bake the model."));
  }
  /* SEVER (object-picker): clustered-coordinates subsections - the numbered
     sites this loc was seen at. Click one to list the whole site. */
  {
    const mine = (S.locClu[e.id] || []).map((id) => S.cluById[id]).filter(Boolean);
    if (mine.length) {
      for (const s of mine.slice(0, 4)) {
        const w = s.local && s.local.d < 150 ? s.local.name : (s.town ? s.town.name : (s.near ? s.near.name : "?"));
        const ln = el("div", "d site");
        ln.textContent = "site: " + s.id + " " + s.kind + " " + s.label + " c(" + s.c[0] + "," + s.c[1] + ") \u03C3" + s.std + " near " + w;
        ln.title = "click to list " + s.id + " (" + s.nlocs + " types)";
        ln.style.cursor = "pointer";
        ln.addEventListener("click", () => {
          S.clusterFilt = s.id;
          S.genreFilt = s.g;
          S.expanded[s.g] = true;
          renderTrays();
          refilter();
        });
        D.appendChild(ln);
      }
    } else {
      D.appendChild(el("div", "d", "site: none clustered"));
    }
  }
  if (e.land.length) D.appendChild(el("div", null, "landmark: " + e.land.join(", ")));
  const areas = areasOf(e).slice(0, 6);
  D.appendChild(el("div", null, areas.length ? "areas: " + areas.map(([a, c]) => a + " x" + c).join(", ") : "areas: none clustered"));
  const structs = e.struct.map((sid) => S.structById.get(sid)).filter(Boolean).slice(0, 4);
  for (const st of structs) {
    const here = (st.locs || {})[e.id] || 0;
    D.appendChild(el("div", "d", (st.l || "cluster #" + st.id) + " [" + st.a + "] box " + st.b.join(",") + " c " + st.c.join(",") + " - this loc x" + here + " of " + Object.values(st.locs || {}).reduce((a, b) => a + b, 0)));
  }
  const runs = S.grams.filter((gr) => e.id >= gr.lo && e.id <= gr.hi).slice(0, 3);
  for (const gr of runs) D.appendChild(el("div", "d", "id run " + gr.lo + "-" + gr.hi + " (regs " + (gr.regs || []).slice(0, 6).join(",") + ")"));
  D.appendChild(el("div", "d", "tiles: " + e.tiles.map((t) => t.join(",")).join("  ")));
}

function footOf(e) {
  if (e.baked && locsReady()) {
    try { return locFootprint(e.baked) || [1, 1]; } catch (err) {}
  }
  if (e.def) return [e.def.sizeX || 1, e.def.sizeY || 1];
  return [1, 1];
}

function followSpot(fp) {
  const { world, player } = S.ctx;
  const px = Math.floor(player.x), pz = Math.floor(player.z);
  const ok = (x, z) => {
    if (!world.inBounds(x, z) || !world.inBounds(x + fp[0] - 1, z + fp[1] - 1)) return false;
    for (let dz = 0; dz < fp[1]; dz++) {
      for (let dx = 0; dx < fp[0]; dx++) {
        /* Ghosts never block: the carried preview's own tiles must not stop
           it from sliding, and a search ghost re-places freely. */
        const o = world.objAt(x + dx, z + dz);
        if (o && !(o.t === "prop" && o.ghost)) return false;
        if (world.walkableTile && !world.walkableTile(x + dx, z + dz)) return false;
      }
    }
    return true;
  };
  if (ok(px, pz + 2)) return { x: px, z: pz + 2 };
  for (let r = 1; r <= 8; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (ok(px + dx, pz + dz)) return { x: px + dx, z: pz + dz };
      }
    }
  }
  return null;
}

/* Grab mode: manipulate already-placed scenery (the beached ship) live.
   B: arm/disarm click-to-grab. Click a placed wreck/prop to select it, then
   R rotates it in place (quarter turns), M hides the ORIGINAL and carries a
   ghost preview live (walk to preview, Enter sets the original down there,
   Esc brings it back), Del removes it,
   Esc backs out (grab, then carry, then grab mode).
   Carries, in-place rotations and deletions are session-only worldgen
   overrides - "Copy edits" copies them as JSON to hand over for baking
   into world.js. */
let grabListener = null;
let propsKeysOn = false;
let grabBtnEl = null;
function actRotate() {
  if (!S) return;
  if (S.grab) grabRotate();
  else if (S.results[S.sel] && S.results[S.sel].baked) { S.rot = (S.rot + 1) & 3; placeGhost(); renderDetail(); }
  else S.ctx.chat("Nothing to rotate - B then click a wreck/prop, or search + arrows for a ghost.", "warn");
}
function actPickup() {
  if (!S) return;
  if (S.grab) grabPickup();
  else S.ctx.chat("Nothing grabbed - B then click a wreck/prop first.", "warn");
}
function actDelete() {
  if (!S) return;
  if (S.carry) {
    /* Delete while ghost-carrying: the original is already out of the world,
       so just log its baked spot as gone and drop the ghost. */
    const c = S.carry;
    clearGhost();
    S.anchor = null;
    recordEdit({ x: c.origOx, z: c.origOz, key: c.key, del: true, t: c.t });
    S.carry = null;
    S.ctx.chat("Deleted " + c.key + " (Copy edits to keep it).", "game");
    renderDetail();
    return;
  }
  if (S.grab) grabDelete();
  else S.ctx.chat("Nothing grabbed - B then click a wreck/prop first.", "warn");
}
function propsKeys(e) {
  if (!panel || panel.hidden || !S) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
    if (e.key === "Enter" && t === S.qInput) { e.preventDefault(); e.stopPropagation(); doStamp(); }
    return;
  }
  let handled = true;
  if (e.key === "Escape" && (S.carry || S.grab || S.ghostTiles.length || S.anchor)) {
    if (S.carry) carryRestore();
    else {
      S.grab = null;
      if (S.ghostTiles.length || S.anchor) cancelGhostFlow();
      else renderDetail();
    }
  }
  else if (e.key === "Escape" && S.clusterFilt) { S.clusterFilt = null; refilter(); renderTrays(); }
  /* Esc never disarms grab mode itself - B toggles that. Esc only backs out
     of the grab, the carry, or the ghost, so one extra press can't silently
     leave you clicking dead pieces. */
  else if (e.key === "ArrowDown") step(1);
  else if (e.key === "ArrowUp") step(-1);
  else if (e.key === "Enter") doStamp();
  else if (e.key === "r" || e.key === "R") actRotate();
  else if (e.key === "m" || e.key === "M") actPickup();
  else if (e.key === "Delete" || e.key === "Backspace") actDelete();
  else if (e.key === "b" || e.key === "B") toggleGrabMode();
  else if (e.key === "g" || e.key === "G") { S.anchor = null; placeGhost(); }
  else if (/^[1-9]$/.test(e.key)) {
    const gi = Number(e.key) - 1;
    if (gi < GENRES.length && S.results[S.sel]) setGenre(S.results[S.sel].id, GENRES[gi]);
  }
  else handled = false;
  if (handled) { e.preventDefault(); e.stopPropagation(); }
}
function toggleGrabMode() {
  if (!S) return;
  S.grabMode = !S.grabMode;
  S.grab = null;
  const cv = document.querySelector("#gameCanvas");
  if (grabListener && cv) cv.removeEventListener("pointerdown", grabListener, true);
  grabListener = null;
  if (S.grabMode) {
    clearGhost();
    grabListener = (e) => {      if (e.pointerType === "touch") return;
      if (e.button !== undefined && e.button !== 0) return;
      const G = window.Game;
      if (!G || !G.pickTile) return;
      /* Carrying: the ghost follows the cursor - ANY left-click on the
         canvas sets the original down at the ghost's spot. Arrows /
         right-click still move you; Esc cancels. */
      if (S.carry) {
        e.preventDefault();
        e.stopPropagation();
        carryCommit();
        return;
      }
      let hit = null;
      try { hit = G.pickTile(e.clientX, e.clientY); } catch (err) { return; }
      const o = hit && (hit.obj || S.ctx.world.objAt(hit.tx, hit.tz));
      if (!o || (o.t !== "wreck" && o.t !== "prop") || !o.key || o.ghost) return;
      e.preventDefault();
      e.stopPropagation();
      grabSelectAt(e.clientX, e.clientY);
    };
    if (cv) cv.addEventListener("pointerdown", grabListener, true);
    S.ctx.chat("Grab mode armed: click a placed piece, then R/M/Del, Esc backs out.", "game");
  } else if (cv) {
    S.ctx.chat("Grab mode off - press B to arm it again.", "game");
  }
  if (grabBtnEl) grabBtnEl.textContent = "Grab placed (B)" + (S.grabMode ? " [ON]" : "");
  renderDetail();
}
function grabRelease(silent) {
  S.grab = null;
  if (!silent) renderDetail();
}
async function grabSelectAt(cx, cy) {
  const { world, view } = S.ctx;
  const G = window.Game;
  if (!G || !G.pickTile) { S.ctx.chat("Picking is unavailable.", "warn"); return; }
  if (S.carry) { S.ctx.chat("Already carrying " + S.carry.key + " - Enter sets it down, Esc puts it back.", "warn"); return; }
  const hit = G.pickTile(cx, cy);
  if (!hit) return;
  const o = hit.obj || world.objAt(hit.tx, hit.tz);
  if (!o || (o.t !== "wreck" && o.t !== "prop") || !o.key || o.ghost) {
    S.ctx.chat("Nothing grabbable there (wreck/prop pieces only).", "warn");
    return;
  }
  S.grab = { ox: o.ox != null ? o.ox : hit.tx, oz: o.oz != null ? o.oz : hit.tz, t: o.t, key: o.key };
  S.ctx.chat("Grabbed " + o.key + " @ " + S.grab.ox + "," + S.grab.oz + " rot " + ((o.rot || 0) & 3) + " - R rotates, M ghost-carries (original hidden), Del deletes.", "game");
  renderDetail();
}
function grabLive() {
  if (!S.grab) return null;
  const o = S.ctx.world.objAt(S.grab.ox, S.grab.oz);
  if (!o || o.key !== S.grab.key) {
    S.ctx.chat("The grabbed piece is gone.", "warn");
    S.grab = null;
    renderDetail();
    return null;
  }
  return o;
}
function grabTiles() {
  const out = [];
  if (S && S.grab) {
    const o = S.ctx.world.objAt(S.grab.ox, S.grab.oz);
    const fx = (o && o.fx) || 1, fz = (o && o.fz) || 1;
    for (let dz = 0; dz < fz; dz++) for (let dx = 0; dx < fx; dx++) out.push([S.grab.ox + dx, S.grab.oz + dz]);
  }
  return out;
}
function grabRotate() {
  const o = grabLive();
  if (!o) return;
  o.rot = (((o.rot || 0) + 1) & 3);
  recordEdit({ x: S.grab.ox, z: S.grab.oz, key: o.key, rot: o.rot, t: o.t });
  rebuildTiles(grabTiles());
  S.ctx.chat("Rotated " + o.key + " to " + o.rot + ".", "game");
  renderDetail();
}
function grabPickup() {
  if (S.carry) { S.ctx.chat("Already carrying " + S.carry.key + " - Enter sets it down, Esc restores it.", "warn"); return; }
  const o = grabLive();
  if (!o) return;
  clearGhost();
  S.anchor = null;
  const ox = o.ox != null ? o.ox : S.grab.ox, oz = o.oz != null ? o.oz : S.grab.oz;
  const fx = o.fx || 1, fz = o.fz || 1;
  const rot = (o.rot || 0) & 3, key = o.key;
  /* Ghost-preview carry: the ORIGINAL leaves the world (kept aside, meshes
     rebuilt) and only the ghost is seen while you walk it around. Enter puts
     the original down at the ghost's spot, Esc brings it back. */
  const { world } = S.ctx;
  const hidden = [];
  for (let dz = 0; dz < fz; dz++) {
    for (let dx = 0; dx < fx; dx++) {
      if (world.objAt(ox + dx, oz + dz) === o) world.delObj(ox + dx, oz + dz);
      hidden.push([ox + dx, oz + dz]);
    }
  }
  world.delObj(ox, oz);
  rebuildTiles(hidden);
  S.carry = { orig: o, origOx: ox, origOz: oz, origRot: rot, fx, fz, key, t: o.t };
  let entry = S.all.find((e) => e.baked === key);
  if (!entry) entry = { id: 0, name: key, n: 0, regs: 0, tiles: [], struct: [], land: [], baked: key, def: { sizeX: fx, sizeY: fz, solid: true, actions: [] }, place: { k: [], t: [], l: [], near: [] }, placeBlob: "", cluBlob: "" };
  S.results = [entry];
  S.sel = 0;
  S.rot = rot;
  const p = S.ctx.player;
  if (p) S.anchorFrom = { x: Math.floor(p.x), z: Math.floor(p.z) };
  S.grab = null;
  S.mouseTile = null;
  S.mouseWarnAt = null;
  renderList();
  placeGhostSoon();
  renderDetail();
  S.ctx.chat("Carrying ghost of " + key + " - original hidden, ghost follows your mouse, click to set it down, R rotates, Esc restores.", "game");
}
/* Enter: the ghost showed where - the ORIGINAL goes there for real. */
function carryCommit() {
  const c = S.carry;
  if (!c) return;
  placeGhostNow();
  const e = S.results[S.sel];
  if (!e || !e.baked) { S.ctx.chat("Select a baked loc to place.", "warn"); return; }
  if (!S.anchor) { S.ctx.chat("No ghost standing - move somewhere clear first.", "warn"); return; }
  for (const [x, z] of S.ghostTiles) {
    const g = S.ctx.world.objAt(x, z);
    if (g && g.ghost) S.ctx.world.delObj(x, z);
  }
  const o = c.orig;
  o.rot = S.rot & 3;
  o.ox = S.anchor.x; o.oz = S.anchor.z;
  const now = [];
  for (let dz = 0; dz < c.fz; dz++) {
    for (let dx = 0; dx < c.fx; dx++) {
      S.ctx.world.setObj(S.anchor.x + dx, S.anchor.z + dz, o);
      now.push([S.anchor.x + dx, S.anchor.z + dz]);
    }
  }
  const rot = (o.rot || 0) & 3;
  const moved = S.anchor.x !== c.origOx || S.anchor.z !== c.origOz;
  if (moved) {
    recordEdit({ x: c.origOx, z: c.origOz, key: c.key, del: true, t: c.t });
    recordEdit({ x: S.anchor.x, z: S.anchor.z, key: c.key, rot, t: c.t });
  } else if (rot !== c.origRot) {
    recordEdit({ x: c.origOx, z: c.origOz, key: c.key, rot, t: c.t });
  }
  const label = c.key + " " + c.origOx + "," + c.origOz + " -> " + S.anchor.x + "," + S.anchor.z + " rot " + rot;
  S.carry = null;
  S.ghostTiles = [];
  S.anchor = null;
  S.results = [];
  S.sel = 0;
  renderList();
  rebuildTiles(now);
  S.ctx.chat("Set down " + label + " (Copy edits to keep it).", "game");
  renderDetail();
}
/* Esc: the ghost goes away, the ORIGINAL comes back to its baked spot. */
function carryRestore(silent) {
  const c = S.carry;
  if (!c) return;
  clearGhost();
  S.anchor = null;
  const o = c.orig;
  o.rot = c.origRot;
  o.ox = c.origOx; o.oz = c.origOz;
  const back = [];
  for (let dz = 0; dz < c.fz; dz++) {
    for (let dx = 0; dx < c.fx; dx++) {
      S.ctx.world.setObj(c.origOx + dx, c.origOz + dz, o);
      back.push([c.origOx + dx, c.origOz + dz]);
    }
  }
  S.carry = null;
  S.results = [];
  S.sel = 0;
  renderList();
  rebuildTiles(back);
  if (!silent) S.ctx.chat("Put " + c.key + " back.", "game");
  renderDetail();
}
function doStamp() {
  if (S.carry) carryCommit();
  else stamp();
}
function cancelGhostFlow() {
  clearGhost();
  S.anchor = null;
  S.ctx.chat("Ghost cancelled.", "game");
  renderDetail();
}
function grabDelete() {
  const { world } = S.ctx;
  const o = grabLive();
  if (!o) return;
  const ox = o.ox != null ? o.ox : S.grab.ox, oz = o.oz != null ? o.oz : S.grab.oz;
  const fx = o.fx || 1, fz = o.fz || 1;
  for (let dz = 0; dz < fz; dz++) {
    for (let dx = 0; dx < fx; dx++) {
      if (world.objAt(ox + dx, oz + dz) === o) world.delObj(ox + dx, oz + dz);
    }
  }
  world.delObj(ox, oz);
  recordEdit({ x: ox, z: oz, key: o.key, del: true, t: o.t });
  const tiles = [];
  for (let dz = 0; dz < fz; dz++) for (let dx = 0; dx < fx; dx++) tiles.push([ox + dx, oz + dz]);
  S.grab = null;
  rebuildTiles(tiles);
  S.ctx.chat("Deleted " + o.key + " (session-only - Copy edits to keep it).", "game");
  renderDetail();
}
function recordEdit(e) {
  S.edits = S.edits.filter((v) => !(v.x === e.x && v.z === e.z));
  S.edits.push(e);
  saveEdits(S.edits);
}
function exportEdits() {
  if (!S.edits.length) { S.ctx.chat("No grab edits yet.", "warn"); return; }
  copyText(JSON.stringify(S.edits), S.ctx.chat, "Edits copied (" + S.edits.length + ") - hand over for baking into world.js.");
}
function clearGhost(skipRebuild) {
  const { world } = S.ctx;
  if (!S.ghostTiles.length) return false;
  const tiles = S.ghostTiles.slice();
  for (const [x, z] of tiles) {
    if (S.stamped.has(x + "," + z)) continue;
    const o = world.objAt(x, z);
    if (o && o.t === "prop" && o.ghost) world.delObj(x, z);
  }
  S.ghostTiles = [];
  if (!skipRebuild) rebuildTiles(tiles);
  return true;
}

function placeGhost(hx, hz) {
  if (!S) return;
  clearTimeout(ghostTimer);
  ghostTimer = 0;
  const { world, view, chat, player } = S.ctx;
  /* One rebuild total: clear without rebuilding, then rebuild once below if
     anything changed (used to rebuild on clear AND on place - ~3s per
     keystroke/step at 256 chunks). */
  const oldTiles = S.ghostTiles.slice();
  const cleared = clearGhost(true);
  const e = S.results[S.sel];
  if (!e || !e.baked) { if (cleared) rebuildTiles(oldTiles); return; }
  if (!locsReady() || !hasLoc(e.baked)) { chat("Scenery bake still loading - ghost when it lands.", "warn"); if (cleared) rebuildTiles(oldTiles); return; }
  const fp = footOf(e);
  /* The anchor tile alone being free is not enough: the footprint may cover a
     wall or door tile (or something stamped since the anchor was set), and a
     stamp must never take a wall with it - furniture goes next to a wall,
     never instead of it. */
  const fitsAt = (ax, az) => {
    for (let dz = 0; dz < fp[1]; dz++) {
      for (let dx = 0; dx < fp[0]; dx++) {
        if (!world.inBounds(ax + dx, az + dz)) return false;
        const o = world.objAt(ax + dx, az + dz);
        if (o && !(o.t === "prop" && o.ghost)) return false;
      }
    }
    return true;
  };
  /* Re-anchor when the old anchor is gone/blocked, or when the writer walked
     away from it: clearGhost deletes our own ghost first, so checking the
     anchor tile afterwards always reads free and the ghost would sit pinned
     where it was first placed no matter where you walk. */
  const px = player ? Math.floor(player.x) : 0, pz = player ? Math.floor(player.z) : 0;
  if (hx !== undefined && hz !== undefined && fitsAt(hx, hz)) {
    /* Mouse-driven carry: the caller already vetted this spot. */
    S.anchor = { x: hx, z: hz };
    S.anchorFrom = { x: px, z: pz };
  } else if (hx === undefined) {
  const holder = S.anchor ? world.objAt(S.anchor.x, S.anchor.z) : null;
  /* Any step re-anchors: precise 1-tile nudges must drag the preview along. */
  const moved = !S.anchorFrom || px !== S.anchorFrom.x || pz !== S.anchorFrom.z;
  if (!S.anchor || moved || (holder && !(holder.t === "prop" && holder.ghost))) {
    S.anchor = followSpot(fp);
    if (S.anchor) S.anchorFrom = { x: px, z: pz };
  }
  }
  if (!S.anchor) { chat("No free tile near you for the ghost.", "warn"); if (cleared) rebuildTiles(oldTiles); return; }
  if (!fitsAt(S.anchor.x, S.anchor.z)) {
    S.anchor = followSpot(fp);
    if (S.anchor) S.anchorFrom = { x: px, z: pz };
    if (!S.anchor) { chat("No free tile near you for the ghost.", "warn"); if (cleared) rebuildTiles(oldTiles); return; }
  }
  const o = { t: "prop", key: e.baked, rot: S.rot, solid: !!(e.def && e.def.solid), ghost: true, ox: S.anchor.x, oz: S.anchor.z, fx: fp[0], fz: fp[1] };
  for (let dz = 0; dz < fp[1]; dz++) {
    for (let dx = 0; dx < fp[0]; dx++) {
      world.setObj(S.anchor.x + dx, S.anchor.z + dz, o);
      S.ghostTiles.push([S.anchor.x + dx, S.anchor.z + dz]);
    }
  }
  rebuildTiles(oldTiles.concat(S.ghostTiles));
  renderDetail();
}

function stamp() {
  placeGhostNow();
  const e = S.results[S.sel];
  if (!e || !e.baked) { S.ctx.chat("Select a baked loc to stamp.", "warn"); return; }
  if (!S.anchor) { S.ctx.chat("No ghost standing - move somewhere clear first.", "warn"); return; }
  for (const [x, z] of S.ghostTiles) {
    const o = S.ctx.world.objAt(x, z);
    if (o && o.t === "prop" && o.ghost) { o.ghost = false; S.stamped.add(x + "," + z); }
  }
  S.placements.push({ x: S.anchor.x, z: S.anchor.z, key: e.baked, rot: S.rot, loc: e.id });
  savePlacements(S.placements);
  S.ghostTiles = [];
  S.anchor = null;
  S.ctx.chat("Stamped " + (e.name || e.id) + " (" + S.placements.length + " placed).", "game");
  placeGhost();
}

function exportPlacements() {
  if (!S.placements.length) { S.ctx.chat("Nothing stamped yet.", "warn"); return; }
  copyText(JSON.stringify({ rev: "241+os21", placements: S.placements }, null, 1), S.ctx.chat, "Placements copied (" + S.placements.length + ") - save as src/data/hand-placed.json, it loads at boot.");
}

function exportQueue() {
  const ids = [...new Set(S.results.filter((e) => !e.baked).map((e) => e.id))];
  if (!ids.length) { S.ctx.chat("Every result is already baked.", "game"); return; }
  copyText(JSON.stringify(ids), S.ctx.chat, "Bake queue copied (" + ids.length + " locs).");
}

function exportGenres() {
  /* SEVER (object-picker): the file's auto-pass plus the writer's tray tags -
     tags win. Paste back into src/data/loc-genres.json to make them stick. */
  const merged = {};
  for (const [id, a] of Object.entries(S.autoGenres)) merged[id] = a.g;
  for (const [name, ids] of Object.entries(S.genres)) for (const id of ids) merged[id] = name;
  copyText(JSON.stringify(merged), S.ctx.chat, "Genres copied (auto + your tags).");
}

function closeProps() {
  if (S && S.carry) carryRestore(true);
  clearGhost();
  if (S && S.followTimer) { clearInterval(S.followTimer); S.followTimer = 0; }
  if (S && S.mouseTrack) { try { window.removeEventListener("pointermove", S.mouseTrack, true); } catch (e) {} S.mouseTrack = null; }
  S.grabMode = false;
  S.grab = null;
  S.carry = null;
  const cv = document.querySelector("#gameCanvas");
  if (grabListener && cv) cv.removeEventListener("pointerdown", grabListener, true);
  grabListener = null;
  if (propsKeysOn) document.removeEventListener("keydown", propsKeys, true);
  propsKeysOn = false;
  if (panel) panel.remove();
  panel = null;
}
