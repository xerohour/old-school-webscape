import { xpForLevel, levelForXp, MAX_LEVEL } from "./util.js";

export const SKILLS = [
  { id: "attack", name: "Attack", group: "combat" },
  { id: "strength", name: "Strength", group: "combat" },
  { id: "defence", name: "Defence", group: "combat" },
  { id: "hitpoints", name: "Hitpoints", group: "combat", start: 10 },
  { id: "ranged", name: "Ranged", group: "combat" },
  { id: "prayer", name: "Prayer", group: "combat" },
  { id: "magic", name: "Magic", group: "combat" },
  { id: "runecrafting", name: "Runecrafting", group: "other" },
  { id: "agility", name: "Agility", group: "other" },
  { id: "herblore", name: "Herblore", group: "other" },
  { id: "thieving", name: "Thieving", group: "other" },
  { id: "crafting", name: "Crafting", group: "other" },
  { id: "fletching", name: "Fletching", group: "other" },
  { id: "slayer", name: "Slayer", group: "combat" },
  { id: "hunter", name: "Hunter", group: "other" },
  { id: "mining", name: "Mining", group: "other" },
  { id: "smithing", name: "Smithing", group: "other" },
  { id: "fishing", name: "Fishing", group: "other" },
  { id: "cooking", name: "Cooking", group: "other" },
  { id: "firemaking", name: "Firemaking", group: "other" },
  { id: "woodcutting", name: "Woodcutting", group: "other" },
  { id: "farming", name: "Farming", group: "other" },
  { id: "construction", name: "Construction", group: "other" },
];

export const SKILL_INDEX = {};
SKILLS.forEach((s, i) => (SKILL_INDEX[s.id] = i));

export function createSkills() {
  const out = {};
  for (const s of SKILLS) out[s.id] = { level: s.start || 1, xp: xpForLevel(s.start || 1) };
  return out;
}

export function levelOf(skills, id) {
  const s = skills[id];
  return s ? s.level : 1;
}

/* --------------------------------------------------- temporary boosts

   A potion, a special attack or a curse can hold a skill above or below the
   level it was trained to. The *base* level is the one that earns experience,
   decides what may be wielded or worn, and fills the Total level box; the
   boosted one is what the attack, defence and skilling rolls read. That split is
   exactly how the live client's two numbers differ while a boost is running, and
   it is why this is a second function rather than a change to `levelOf`.

   The boost itself is a signed number of levels on the skill's own entry
   (`skills.strength.boost`), which is deliberately not part of the save: the
   live game drops every temporary change when you log out, and src/save.js
   writes only `level` and `xp`.

   Decay is the live game's own rule for every temporary stat change: one level
   a minute, until the change is gone. A +10 Rampage is therefore ten minutes of
   Strength, and the same clock runs down the drain it put on the other stats. */
export const BOOST_DECAY_TICKS = 100;
const BOOST_DECAY_SECONDS = BOOST_DECAY_TICKS * 0.6;

export function boosted(skills, id) {
  const s = skills[id];
  if (!s) return 1;
  return Math.max(0, s.level + (s.boost || 0));
}

export function applyBoost(player, id, delta) {
  const s = player.skills[id];
  if (!s || !delta) return;
  s.boost = (s.boost || 0) + delta;
  s.boostTicks = BOOST_DECAY_SECONDS;
}

/* One tick of the decay clock for every boosted skill. A boost moves one level
   closer to zero each minute and is removed the moment it gets there, so the
   base level is all that is left. */
export function tickBoosts(player, dt) {
  for (const id of Object.keys(player.skills)) {
    const s = player.skills[id];
    if (!s.boost) continue;
    s.boostTicks = (s.boostTicks == null ? BOOST_DECAY_SECONDS : s.boostTicks) - dt;
    while (s.boost && s.boostTicks <= 0) {
      s.boost -= Math.sign(s.boost);
      s.boostTicks += BOOST_DECAY_SECONDS;
    }
    if (!s.boost) { delete s.boost; delete s.boostTicks; }
  }
}

export function combatLevel(skills) {
  const l = (id) => levelOf(skills, id);
  const base = 0.25 * (l("defence") + l("hitpoints") + Math.floor(l("prayer") / 2));
  const melee = 0.325 * (l("attack") + l("strength"));
  const range = 0.325 * Math.floor(l("ranged") * 1.5);
  const mage = 0.325 * Math.floor(l("magic") * 1.5);
  return Math.floor(base + Math.max(melee, range, mage));
}

export function totalLevel(skills) {
  let t = 0;
  for (const s of SKILLS) t += levelOf(skills, s.id);
  return t;
}

export function totalXp(skills) {
  let t = 0;
  for (const s of SKILLS) t += skills[s.id].xp;
  return t;
}

/* The sim tick an xp gain is stamped with, read by `addXp` below and by nothing
   else. It is a hook rather than an import because this file is a leaf (util.js
   and nothing more) and the tick is only wanted for the toast's own bookkeeping
   (src/ui.js#addXpDrop): xp from the same tick is one floating figure, xp from a
   later tick is another, and the only clock that can answer "same tick" is the
   sim's own counter - `Game.tickCount`, which is bumped just before `stepSim`
   runs, so it reads the tick being simulated. Wall-clock time cannot answer it:
   a frame that covers two sim ticks (a slow device, or a tab coming back from
   the background) would stamp both ticks with the same instant and the second
   gain would silently join the first's toast, which is the one thing a drop must
   never do. Until the hook is set (a bare test harness that earns xp with no
   game running) every gain is tick 0. */
let tickOf = () => 0;
export function setXpTickSource(fn) { tickOf = typeof fn === "function" ? fn : (() => 0); }

export function addXp(player, skillId, amount, source) {
  const s = player.skills[skillId];
  if (!s || amount <= 0) return { gained: 0, level: s ? s.level : 1 };
  const before = s.level;
  s.xp += amount;
  const target = Math.min(MAX_LEVEL, levelForXp(s.xp));
  let gained = 0;
  if (target > s.level) {
    gained = target - s.level;
    s.level = target;
  }
  if (skillId === "hitpoints" && gained) {
    player.maxHp = Math.max(10, player.skills.hitpoints.level);
    player.hp = Math.min(player.maxHp, player.hp + gained);
  }
  player.xpDrops = player.xpDrops || [];
  player.xpDrops.push({ skill: skillId, amount, tick: tickOf(), at: { x: player.x, z: player.z } });
  if (gained) {
    player.levelUps = player.levelUps || [];
    player.levelUps.push({ skill: skillId, level: s.level, before });
  }
  return { gained, level: s.level };
}

export function drainHp(player, amount) {
  player.hp = Math.max(0, player.hp - amount);
  return player.hp;
}

export function heal(player, amount) {
  player.hp = Math.min(player.maxHp, player.hp + amount);
  return player.hp;
}
