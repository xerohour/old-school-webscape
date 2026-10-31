import { Game, playCastAnim } from "./game.js";
import { TICK_S } from "./tick.js";
import { Gfx } from "./gfx.js";
import { spellById } from "./magic.js";
import { worldStrike, creatureStrike, creatureInReach, NPC_ATTACK_SPEED } from "./combat.js";
const STRIKE_TICKS = 5;
const BLAST = spellById.get(53);
const IBAN_SPIKE = 83;
const MAX_HIT = 45;
const NOVA = 1;
function alive(npc) {
  return !!npc && !npc.dead && !npc.corpse && npc.hp > 0;
}
function tickIban(dt) {
  if (!Game.npcs || !Game.player) return;
  let mage = null;
  for (const npc of Game.npcs) {
    if (npc.type === "iban" && alive(npc)) { mage = npc; break; }
  }
  for (const npc of Game.npcs) {
    if (npc.type === "iban") {
      if (alive(npc)) tickMage(npc, dt);
      continue;
    }
    if (npc.ibanFoe) tickIbanFoe(npc, dt, mage);
  }
}
function tickMage(npc, dt) {
  npc.strikeCd = (npc.strikeCd || 0) - dt;
  if (npc.strikeCd > 0) return;
  const cx = Math.floor(npc.x);
  const cz = Math.floor(npc.z);
  const cheb = (x, z) => Math.max(Math.abs(x - cx), Math.abs(z - cz));
  const victims = [];
  for (const e of Game.npcs) {
    if (e === npc || e.dead || e.corpse) continue;
    if (cheb(Math.floor(e.x), Math.floor(e.z)) > NOVA) continue;
    victims.push(e);
  }
  if (!victims.length) return;
  let faceX = null, faceZ = null;
  let best = Infinity;
  for (const v of victims) {
    const d = cheb(Math.floor(v.x), Math.floor(v.z));
    if (d < best) { best = d; faceX = v.x; faceZ = v.z; }
  }
  npc.dir = Math.atan2(faceX - npc.x, faceZ - npc.z);
  castBlast(npc, victims);
}
function castBlast(npc, victims) {
  playCastAnim(npc, "cast_iban", castPoseSeconds(npc, "cast_iban"));
  castCharge(npc);
  npc.strikeCd = STRIKE_TICKS * TICK_S;
  for (const v of victims) fireBolt(npc, v, () => worldStrike(v, 1 + Math.floor(Math.random() * MAX_HIT)));
}
/* His red hand-charge: the standard Iban Blast gather, plus a second layer of
   the same graphic riding over everything at a fiercer rate - denser and
   hotter than the spellbook's, and his alone (spell 53 plays one plain 87). */
function castCharge(npc) {
  const x = npc.rx != null ? npc.rx : npc.x;
  const z = npc.rz != null ? npc.rz : npc.z;
  const dir = npc.dir || 0;
  Gfx.play(BLAST.start, { x, z, height: 92, dir, target: npc });
  Gfx.play(BLAST.start, { x, z, height: 92, dir, target: npc, onTop: true, rate: 1.3 });
}
/* His cast pose lets go one game tick sooner than the sequence's own length.
   The spell itself - carrier delay, spike arrival, damage, cadence - is
   untouched; only the animation completes faster. */
function castPoseSeconds(npc, name) {
  const a = npc.ch && npc.ch.data && npc.ch.data._anims && npc.ch.data._anims[name];
  const full = a ? a.totalTicks * 0.02 : STRIKE_TICKS * TICK_S;
  return Math.max(0.1, full - TICK_S);
}
function fireBolt(npc, target, apply) {
  const fromX = npc.rx != null ? npc.rx : npc.x;
  const fromZ = npc.rz != null ? npc.rz : npc.z;
  const tx = target.x, tz = target.z;
  Gfx.projectile({
    gfx: IBAN_SPIKE,
    fromX, fromZ, fromH: 0,
    target, toX: tx, toZ: tz, toH: 0,
    delay: BLAST.projDelay,
    duration: 0.05,
    hidden: true,
    onArrive: (at) => {
      if (target.dead || target.corpse) return;
      const x = at && at.x != null ? at.x : tx;
      const z = at && at.z != null ? at.z : tz;
      Gfx.play(IBAN_SPIKE, {
        x, z,
        height: 0,
        dir: npc.dir || 0,
        target,
        onTop: true,
      });
      apply();
    },
  });
}
function tickIbanFoe(npc, dt, mage) {
  if (npc.dead || npc.corpse || npc.hp <= 0) return;
  if (!mage) {
    npc.target = null;
    npc.aggroed = null;
    return;
  }
  npc.target = mage;
  npc.aggroed = mage;
  npc.foeCd = (npc.foeCd || 0) - dt;
  if (npc.foeCd > 0) return;
  if (!creatureInReach(npc, mage)) return;
  npc.foeCd = (NPC_ATTACK_SPEED[npc.type] || 4) * TICK_S;
  creatureStrike(npc, mage);
}
export function initIban(game) {
  const prev = game.hooks.onTick;
  game.hooks.onTick = (dt) => {
    if (prev) prev(dt);
    tickIban(dt);
  };
}
