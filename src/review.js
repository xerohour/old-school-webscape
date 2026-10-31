import { buildKitHead, buildHeadgearHead, defaultAppearance, kitsReady, loadIdentityKits, headKitIds, selectableKits } from "./identikits.js";
import { headData, heldData, hasHeldModel, prepareHeld, loadHeldModels, loadHeldModelsFemale, STRIPPED_HELM_HAIR, HELM_EYE_BODY_Y, makeStaticMesh } from "./models3d.js";
import { ITEMS, itemDef, itemName } from "./items.js";

const CELL = 96;
const PITCH = 100;
const GUT = 150;
const HEAD = 28;
const ZOOM = 796;
const PITCH_DEG = 40;
const YAW = 166;
const EYE = 43303;
const SKIN = 4550;

function b64ToU16(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Uint16Array(out.buffer);
}

function b64ToU8(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function entryStats(key, kitFaces) {
  const e = headData.get(key);
  if (!e) return null;
  const colors = b64ToU16(e.colors);
  const parts = e.partOf ? b64ToU8(e.partOf) : null;
  const n = Math.min(kitFaces, e.fcount);
  let hair = 0, hairBeard = 0, eyes = 0, skin = 0;
  const hist = {};
  for (let f = 0; f < n; f++) {
    const c = colors[f];
    hist[c] = (hist[c] | 0) + 1;
    if (c === EYE) eyes++;
    else if (c === SKIN) skin++;
    else if (STRIPPED_HELM_HAIR.has(c)) {
      if (parts && parts[f] === 1) hairBeard++;
      else hair++;
    }
  }
  return { hair, hairBeard, eyes, skin, hist };
}

function hatFaces(helm, sex) {
  try {
    const hd = prepareHeld(helm, sex);
    return hd ? hd.fcount : 0;
  } catch (e) {
    return 0;
  }
}

function helmClass(helm, sex) {
  try {
    const hd = prepareHeld(helm, sex);
    if (!hd) return "none";
    if (hd.hidesHead) return "hide";
    if (hd.maskStripped) return "mask";
    return "hat";
  } catch (e) {
    return "none";
  }
}

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

function hairSkinOf(key) {
  const e = headData.get(key);
  if (!e) return null;
  const colors = b64ToU16(e.colors);
  let hair = 0, skin = 0;
  for (let f = 0; f < e.fcount; f++) {
    if (colors[f] === SKIN) skin++;
    else if (STRIPPED_HELM_HAIR.has(colors[f])) hair++;
  }
  return { hair, skin };
}

function discoverProbes() {
  const ids = headKitIds();
  const probes = [];
  for (const gender of ["male", "female"]) {
    const dj = defaultAppearance(gender).parts.jaw;
    /* Same-gender design-screen kits only (see review-ui.js) - the raw kit
       list mixes male heads, beard kits and female heads. */
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
    probes.push({ name: tag + "-max", gender, head: maxH, jaw: dj });
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
      probes.push({ name: "m-beard", gender, head: maxH, jaw: bestJ });
    }
  }
  const seen = new Set();
  return probes.filter((p) => {
    const k = p.gender + ":" + p.head + ":" + p.jaw;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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

export async function runHeadgearReview(view, opts) {
  opts = opts || {};
  const CELL = opts.cell || 96;
  const PITCH = CELL + 4;
  const YAW = opts.yaw == null ? 166 : opts.yaw;
  window.__reviewProgress = "loading";
  try {
    await loadIdentityKits();
  } catch (e) {}
  try {
    if (!heldData.size) await loadHeldModels();
  } catch (e) {}
  try {
    await loadHeldModelsFemale();
  } catch (e) {}
  const probes = discoverProbes();
  const debug = { headN: headKitIds().length, kitsReady: kitsReady(), heldSize: heldData.size };
  if (opts.scan) {
    const ids = headKitIds();
    const out = {};
    for (const h of ids) {
      for (const gender of ["male", "female"]) {
        const a = appFor(gender, h, gender === "female" ? -1 : 10);
        let key = null;
        try {
          key = buildKitHead(a);
        } catch (e) {
          key = null;
        }
        if (!key) continue;
        const e = headData.get(key);
        if (!e) continue;
        const colors = b64ToU16(e.colors);
        const odd = {};
        for (let f = 0; f < e.fcount; f++) {
          const c = colors[f];
          if (c === EYE || c === SKIN || c === 0 || c === 127 || c === 1944 || c === 4661) continue;
          if (STRIPPED_HELM_HAIR.has(c)) continue;
          odd[c] = (odd[c] | 0) + 1;
        }
        if (Object.keys(odd).length) out[gender + ":" + h] = odd;
      }
    }
    return { probes: probes.map((p) => p.name), oddHeads: out };
  }
  if (opts.measure) {
    const out = [];
    const i16 = (s) => {
      const b = atob(s);
      const v = new Int16Array(b.length / 2);
      for (let i = 0; i < v.length; i++) v[i] = b.charCodeAt(i * 2) | (b.charCodeAt(i * 2 + 1) << 8);
      return v;
    };
    for (const helm of (opts.only && opts.only.length ? helmList().filter((h) => opts.only.includes(h)) : helmList())) {
      const row = { helm };
      try {
        const hd0m = prepareHeld(helm, "m");
        row.cls = hd0m ? (hd0m.hidesHead ? "hide" : hd0m.maskStripped ? "mask" : "hat") : "?";
      } catch (err) {}
      for (const p of probes) {
        let key = null;
        try {
          key = buildHeadgearHead(appFor(p.gender, p.head, p.jaw), helm);
        } catch (e) {
          key = null;
        }
        if (!key) continue;
        const e = headData.get(key);
        if (!e) continue;
        let hfn = 0, hvn = 0;
        try {
          const hd = prepareHeld(helm, p.gender === "female" ? "f" : "m");
          hfn = hd ? hd.fcount : 0;
          hvn = hd ? hd.vcount : 0;
        } catch (err) {}
        const colors = b64ToU16(e.colors);
        const faces = b64ToU16(e.faces);
        const verts = i16(e.verts);
        const kitN = e.fcount - hfn;
        const kv = e.vcount - hvn;
        let hatLo = 1e18, hatHi = -1e18, skCrown = 1e18, skMinX = 1e18, skMaxX = -1e18, hatMinX = 1e18, hatMaxX = -1e18;
        for (let vi = kv * 3; vi < verts.length; vi += 3) {
          const x = verts[vi], y = verts[vi + 1];
          if (y < hatLo) hatLo = y;
          if (y > hatHi) hatHi = y;
          if (x < hatMinX) hatMinX = x;
          if (x > hatMaxX) hatMaxX = x;
        }
        for (let f = 0; f < kitN; f++) {
          if (colors[f] !== 4550) continue;
          for (let k = 0; k < 3; k++) {
            const vi = faces[f * 3 + k] * 3;
            const vx = verts[vi], vy = verts[vi + 1];
            if (vy < skCrown) skCrown = vy;
            if (vx < skMinX) skMinX = vx;
            if (vx > skMaxX) skMaxX = vx;
          }
        }
        row[p.name] = { hatLo, hatHi, skCrown, baseBelow: hatHi - skCrown, crownOver: skCrown - hatLo, hatW: hatMaxX - hatMinX, skinW: skMaxX - skMinX };
      }
      out.push(row);
    }
    return { probes: probes.map((p) => p.name), measure: out };
  }
  if (opts.parts) {
    const pm = {};
    for (const p of probes) {
      let key = null;
      try {
        key = buildKitHead(appFor(p.gender, p.head, p.jaw));
      } catch (e) {
        key = null;
      }
      if (!key) continue;
      const e = headData.get(key);
      if (!e || !e.partOf) continue;
      const colors = b64ToU16(e.colors);
      const parts = b64ToU8(e.partOf);
      const m = {};
      for (let f = 0; f < e.fcount; f++) {
        const c = colors[f];
        if (!m[c]) m[c] = {};
        m[c][parts[f]] = (m[c][parts[f]] | 0) + 1;
      }
      pm[p.name] = m;
    }
    return { probes: probes.map((p) => p.name), partsMap: pm };
  }
  let helms = helmList();
  if (opts.only && opts.only.length) {
    const want = new Set(opts.only);
    helms = helms.filter((h) => want.has(h));
  }
  const cols = probes.length;
  const rows = helms.length + 1;
  const sheet = document.createElement("canvas");
  sheet.width = GUT + cols * PITCH;
  sheet.height = HEAD + rows * PITCH;
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = "#181410";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.font = "12px monospace";
  ctx.textBaseline = "top";
  const audit = [];
  let fails = 0;
  const total = rows * cols;
  let done = 0;
  async function cell(helm, probe, cx, cy) {
    const sex = probe.gender === "female" ? "f" : "m";
    let key = null;
    try {
      key = helm ? buildHeadgearHead(appFor(probe.gender, probe.head, probe.jaw), helm) : buildKitHead(appFor(probe.gender, probe.head, probe.jaw));
    } catch (e) {
      key = null;
    }
    const cv = document.createElement("canvas");
    cv.width = CELL;
    cv.height = CELL;
    let meshFaces = 0;
    if (key) {
      const mesh = makeStaticMesh(key);
      if (mesh) {
        meshFaces = mesh.geometry.attributes.position.count / 3;
        try {
          view.drawChatHead(mesh, cv, { zoom: ZOOM, pitch: PITCH_DEG, yaw: YAW });
        } catch (e) {}
      }
    }
    ctx.drawImage(cv, cx, cy);
    let verdict = "ref", kitFaces = 0, hair = 0, hairBeard = 0, eyes = 0, skin = 0, cls = "bare", hist = null;
    if (!helm && key) {
      const e = headData.get(key);
      kitFaces = e ? e.fcount : 0;
      const st = entryStats(key, kitFaces);
      hair = st ? st.hair : 0;
      hairBeard = st ? st.hairBeard : 0;
      eyes = st ? st.eyes : 0;
      skin = st ? st.skin : 0;
    }
    if (helm && key) {
      const e = headData.get(key);
      const hf = hatFaces(helm, sex);
      kitFaces = e ? e.fcount - hf : 0;
      const st = entryStats(key, kitFaces);
      hair = st ? st.hair : 0;
      hairBeard = st ? st.hairBeard : 0;
      eyes = st ? st.eyes : 0;
      skin = st ? st.skin : 0;
      hist = st ? st.hist : null;
      cls = helmClass(helm, sex);
      if (cls === "hide") verdict = kitFaces === 0 ? "pass" : "FAIL";
      else if (cls === "mask") verdict = hair === 0 ? "pass" : "FAIL";
      else verdict = "eyeball";
      if (verdict === "FAIL") fails++;
    }
    audit.push({ helm: helm || "(bare)", probe: probe.name, cls, kitFaces, keptHair: hair, beardHair: hairBeard, eyes, skin, meshFaces, verdict, hist });
    done++;
    window.__reviewProgress = done + "/" + total;
  }
  for (let c = 0; c < cols; c++) {
    ctx.fillStyle = "#ffe9a8";
    ctx.fillText(probes[c].name, GUT + c * PITCH + 4, 6);
  }
  for (let r = 0; r < rows; r++) {
    const helm = r === 0 ? null : helms[r - 1];
    ctx.fillStyle = helm ? "#d8d8d8" : "#7fd07f";
    let label = helm ? itemName(helm) : "(bare heads)";
    if (label.length > 22) label = label.slice(0, 21) + "…";
    ctx.fillText(label, 4, HEAD + r * PITCH + 40);
    for (let c = 0; c < cols; c++) {
      await cell(helm, probes[c], GUT + c * PITCH, HEAD + r * PITCH);
    }
  }
  const sheetURL = sheet.toDataURL();
  window.__reviewSheet = sheetURL;
  window.__reviewAudit = audit;
  window.__reviewProgress = "done";
  return { probes: probes.map((p) => p.name), helms, fails, cells: audit.length, sheet: sheetURL, audit, debug };
}
