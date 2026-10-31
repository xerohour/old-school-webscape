import { buildKitHead, buildHeadgearHead, defaultAppearance, headKitIds, loadIdentityKits, selectableKits } from "./identikits.js";
import { headData, hasHeldModel, prepareHeld, loadHeldModels, loadHeldModelsFemale, STRIPPED_HELM_HAIR, makeStaticMesh } from "./models3d.js";
import { ITEMS, itemDef, itemName } from "./items.js";

const ZOOM = 796;

function appFor(gender, head, jaw) {
  const a = defaultAppearance(gender);
  a.parts.head = head;
  if (gender !== "female" && jaw != null) a.parts.jaw = jaw;
  a.colours.hair = 3;
  a.colours.torso = 1;
  a.colours.legs = 11;
  a.colours.feet = 2;
  a.colours.skin = 0;
  return a;
}

function b64ToU16(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Uint16Array(out.buffer);
}

function hairSkinOf(key) {
  const e = headData.get(key);
  if (!e) return null;
  const colors = b64ToU16(e.colors);
  let hair = 0, skin = 0;
  for (let f = 0; f < e.fcount; f++) {
    if (colors[f] === 4550) skin++;
    else if (STRIPPED_HELM_HAIR.has(colors[f])) hair++;
  }
  return { hair, skin };
}

function discoverProbes() {
  const ids = headKitIds();
  const probes = [];
  for (const gender of ["male", "female"]) {
    const dj = defaultAppearance(gender).parts.jaw;
    /* Only this gender's own design-screen heads: the kit list mixes male
       heads, beard kits and female heads, and max-hair used to land on a
       female head for the male probes. */
    const sel = selectableKits(gender) || {};
    const heads = (sel.head && sel.head.length ? sel.head : ids);
    const jaws = (sel.jaw && sel.jaw.length ? sel.jaw : ids);
    const cands = [];
    for (const h of heads) {
      let key = null;
      try {
        key = buildKitHead(appFor(gender, h, dj));
      } catch (e) {
        key = null;
      }
      if (!key) continue;
      const hs = hairSkinOf(key);
      if (!hs) continue;
      cands.push({ h, hair: hs.hair, skin: hs.skin });
    }
    const real = cands.filter((c) => c.skin >= 50);
    const pool = real.length ? real : cands;
    if (!pool.length) continue;
    let maxH = pool[0].h, maxHair = -1;
    for (const c of pool) {
      if (c.hair > maxHair) { maxHair = c.hair; maxH = c.h; }
    }
    /* Baldish probes retired - every head is judged on the mane probes. */
    const tag = gender === "female" ? "f" : "m";
    probes.push({ name: tag + "-max (mane)", gender, head: maxH, jaw: dj });
    if (gender === "male" && maxH != null) {
      let bestJ = dj, bestHair = -1;
      for (const j of jaws) {
        let key = null;
        try {
          key = buildKitHead(appFor(gender, maxH, j));
        } catch (e) {
          key = null;
        }
        if (!key) continue;
        const hs = hairSkinOf(key);
        if (hs && hs.hair > bestHair) { bestHair = hs.hair; bestJ = j; }
      }
      probes.push({ name: "m-beard (mane+goatee)", gender, head: maxH, jaw: bestJ });
    }
  }
  return probes;
}

function helmList() {
  return Object.keys(ITEMS).filter((id) => {
    try {
      const d = itemDef(id);
      return d && d.slot === "head" && hasHeldModel(id);
    } catch (e) {
      return false;
    }
  }).sort();
}

function helmClass(helm, sex) {
  try {
    const hd = prepareHeld(helm, sex);
    if (!hd) return "?";
    if (hd.hidesHead) return "hide";
    if (hd.maskStripped) return "mask";
    return "hat";
  } catch (e) {
    return "?";
  }
}

export async function openHeadgearReview(view, startHelm) {
  if (document.getElementById("hgReview")) {
    document.getElementById("hgReview").hidden = false;
    return;
  }
  try {
    await loadIdentityKits();
  } catch (e) {}
  try {
    await loadHeldModels();
  } catch (e) {}
  try {
    await loadHeldModelsFemale();
  } catch (e) {}
  const probes = discoverProbes();
  const helms = helmList();
  /* The done set: every helm here has all 3 probes user-approved. The old
     per-cell good/bad voting is gone; this list is the record now. */
  const DONE = new Set(["blue_partyhat", "red_partyhat", "yellow_partyhat", "green_partyhat", "purple_partyhat", "white_partyhat",
    "adamant_fullhelm", "black_fullhelm", "bronze_fullhelm", "dragon_fullhelm", "iron_fullhelm", "mithril_fullhelm", "rune_fullhelm", "steel_fullhelm", "white_fullhelm",
    "guthans_helm", "torags_helm", "initiate_sallet",
    "archer_helm", "berserker_helm", "farseer_helm", "fremennik_helm", "rock_helm", "skeletal_helm", "spined_helm", "warrior_helm", "granite_helm", "helm_of_neitiznot", "infinity_hat", "mystic_hat", "mystic_dark_hat", "mystic_light_hat",
    "adamant_helm", "black_helm", "bronze_helm", "dragon_helm", "iron_helm", "mithril_helm", "rune_helm", "steel_helm", "white_helm",
    "third_age_full_helmet", "third_age_mage_hat", "third_age_range_coif", "chef_hat", "coif", "leather_coif", "air_tiara", "snakeskin_bandana", "splitbark_helm", "tiara", "moonclan_helm", "beekeeper_hat", "black_wizard_hat", "dagonhai_hat", "dark_wizard_hat", "wizard_hat",
    "agility_hood", "ahrims_hood", "veracs_helm", "attack_hood", "construction_hood", "cooking_hood", "crafting_hood", "defence_hood", "farming_hood", "firemaking_hood", "fishing_hood", "fletching_hood", "ghostly_hood", "herblore_hood", "hitpoints_hood", "hunter_hood", "magic_hood", "max_hood", "mining_hood", "prayer_hood", "quest_point_hood", "ranging_hood", "runecraft_hood", "slayer_hood", "smithing_hood", "strength_hood", "thieving_hood", "woodcutting_hood", "guthix_mitre", "saradomin_mitre", "zamorak_mitre"]);
  let idx = 0;
  let filter = "all";
  if (startHelm && helms.includes(startHelm)) idx = helms.indexOf(startHelm);
  function shownProbes(helm) {
    return probes;
  }

  const host = document.createElement("div");
  host.id = "hgReview";  host.innerHTML =
    "<style>" +
    "#hgReview{position:fixed;inset:0;z-index:99999;background:#14100c;color:#eee;font:14px system-ui,sans-serif;display:flex;flex-direction:column}" +
    "#hgBar{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#241c12;border-bottom:1px solid #554;flex-wrap:wrap}" +
    "#hgReview button{background:#3d3427;color:#ffe9a8;border:1px solid #8a764f;padding:6px 12px;font-size:14px;cursor:pointer;border-radius:4px}" +
    "#hgReview button:hover{background:#54462e}" +
    "#hgReview select{background:#3d3427;color:#ffe9a8;border:1px solid #8a764f;padding:5px;font-size:14px;border-radius:4px}" +
    "#hgGrid{flex:1;overflow:auto;display:flex;gap:12px;padding:16px;align-items:flex-start;justify-content:center;flex-wrap:wrap}" +
    ".hgCell{background:#000;border:3px solid #444;text-align:center;padding:6px}" +
    ".hgCell canvas{width:192px;height:192px;image-rendering:pixelated;background:#222;display:block}" +
    ".hgCell .hgLab{font-size:12px;color:#ffe9a8;margin-top:4px}" +
    ".hgCell.done{border-color:#3fd03f}" +
    "</style>" +
    "<div id='hgBar'><b id='hgTitle'></b><span id='hgCount'></span>" +
    "<button id='hgPrev'>&larr; prev (A)</button>" +
    "<button id='hgNext'>next helm (D) &rarr;</button>" +
    "<select id='hgFilter'><option value='all'>all</option><option value='todo'>to do</option><option value='done'>done</option></select>" +
    "<select id='hgClass'><option value='all'>all classes</option><option value='mask'>mask</option><option value='hat'>hat</option><option value='hide'>hide</option></select>" +
    "<button id='hgClose'>close</button></div>" +
    "<div id='hgGrid'></div>";
  document.body.appendChild(host);
  const grid = host.querySelector("#hgGrid");
  const title = host.querySelector("#hgTitle");
  const count = host.querySelector("#hgCount");

  function visibleHelms() {
    const cf = host.querySelector("#hgClass").value;
    return helms.filter((h) => {
      if (filter === "todo" && DONE.has(h)) return false;
      if (filter === "done" && !DONE.has(h)) return false;
      if (cf !== "all" && helmClass(h, "m") !== cf) return false;
      return true;
    });
  }

  function render() {
    const list = visibleHelms();
    if (!list.length) {
      title.textContent = "no helms match filter";
      grid.innerHTML = "";
      count.textContent = "";
      return;
    }
    idx = Math.max(0, Math.min(idx, list.length - 1));
    const helm = list[idx];
    const cls = helmClass(helm, "m");
    title.textContent = (idx + 1) + "/" + list.length + " " + itemName(helm) + " [" + cls + "] " + helm + (DONE.has(helm) ? " DONE" : "");
    count.textContent = "done " + helms.filter((h) => DONE.has(h)).length + "/" + helms.length;
    grid.innerHTML = "";
    shownProbes(helm).forEach((p, pi) => {
      const cell = document.createElement("div");
      cell.className = "hgCell" + (DONE.has(helm) ? " done" : "");
      const cvs = document.createElement("canvas");
      cvs.width = 192;
      cvs.height = 192;
      let key = null;
      try {
        key = buildHeadgearHead(appFor(p.gender, p.head, p.jaw), helm);
      } catch (e) {
        key = null;
      }
      if (key) {
        const mesh = makeStaticMesh(key);
        if (mesh) {
          try {
            view.drawChatHead(mesh, cvs, { zoom: ZOOM, pitch: 40, yaw: 166 });
          } catch (e) {}
        }
      }
      const lab = document.createElement("div");
      lab.className = "hgLab";
      lab.textContent = (pi + 1) + ". " + p.name;
      cell.appendChild(cvs);
      cell.appendChild(lab);
      grid.appendChild(cell);
    });
  }

  host.querySelector("#hgPrev").onclick = () => { idx = Math.max(0, idx - 1); render(); };
  host.querySelector("#hgNext").onclick = () => { idx++; render(); };
  host.querySelector("#hgFilter").onchange = (e) => { filter = e.target.value; idx = 0; render(); };
  host.querySelector("#hgClass").onchange = () => { idx = 0; render(); };
  host.querySelector("#hgClose").onclick = () => { host.hidden = true; };
  window.addEventListener("keydown", (e) => {
    if (host.hidden) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "")) return;
    const k = e.key.toLowerCase();
    if (k === "a") { idx = Math.max(0, idx - 1); render(); }
    else if (k === "d") { idx++; render(); }
  });
  window.__hgDone = DONE;
  render();
}
