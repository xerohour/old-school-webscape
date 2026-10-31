import * as THREE from "https://esm.sh/three@0.160.0";

const STATUES = [
  { x: 62.5, z: 51.5, spin: 0.45, phase: 0 },
];
const PER_STATUE = 3;
const RISE_RATE = 0.11;
const HEIGHT = 2.2;
const BASE_LIFT = 0.4;
const ORBIT_R = 0.62;
const ARC = 0.5;
const WIDTH = 0.09;
const SEGS = 10;
const TWIST = Math.PI / 2;
const FADE = 0.5 * RISE_RATE;

let ribbons = [];

function makeRibbonGeometry(spin) {
  const dir = Math.sign(spin) || 1;
  const risePerRad = (RISE_RATE * HEIGHT) / Math.abs(spin);
  const dy = ARC * risePerRad;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= SEGS; i++) {
    const s = i / SEGS;
    const phi = -dir * (1 - s) * ARC;
    const y = -(1 - s) * dy;
    const tw = s * TWIST;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    const wHalf = (WIDTH / 2) * (0.35 + 0.65 * s);
    const ox = c * Math.cos(tw) * wHalf;
    const oz = sn * Math.cos(tw) * wHalf;
    const oy = Math.sin(tw) * wHalf;
    pos.push(c * ORBIT_R - ox, y - oy, sn * ORBIT_R - oz);
    pos.push(c * ORBIT_R + ox, y + oy, sn * ORBIT_R + oz);
    if (i < SEGS) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function makeRibbonMesh(scene, spin) {
  const mesh = new THREE.Mesh(
    makeRibbonGeometry(spin),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, depthWrite: false })
  );
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

export const StatueSwirl = {
  view: null,

  setView(view) {
    if (this.view === view) return;
    this.clear();
    this.view = view;
    if (!view || !view.scene) return;
    for (const def of STATUES) {
      const gy = view.world ? view.world.heightAt(def.x, def.z) : 0;
      for (let i = 0; i < PER_STATUE; i++) {
        const mesh = makeRibbonMesh(view.scene, def.spin);
        ribbons.push({
          mesh,
          def,
          baseY: gy,
          y01: (i / PER_STATUE + Math.random() * 0.2) % 1,
          ang: Math.random() * Math.PI * 2 + def.phase,
          cool: 0,
        });
      }
    }
  },

  clear() {
    for (const r of ribbons) {
      if (this.view && this.view.scene) this.view.scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    }
    ribbons = [];
  },

  tick(dt) {
    if (!ribbons.length) return;
    const step = Math.min(dt, 0.1);
    for (const r of ribbons) {
      if (r.cool > 0) {
        r.cool -= step;
        if (r.cool <= 0) {
          r.y01 = 0;
          r.ang = Math.random() * Math.PI * 2;
          r.mesh.visible = true;
        } else {
          r.mesh.visible = false;
          continue;
        }
      }
      r.y01 += step * RISE_RATE;
      if (r.y01 >= 1 + FADE) {
        r.y01 = 0;
        r.cool = 0.8 + Math.random() * 1.2;
        r.mesh.visible = false;
        continue;
      }
      r.ang += step * r.def.spin;
      const y = Math.min(r.y01, 1);
      r.mesh.position.set(r.def.x, r.baseY + BASE_LIFT + y * HEIGHT, r.def.z);
      r.mesh.rotation.set(0, -r.ang, 0);
      const fIn = Math.min(r.y01 / FADE, 1);
      const fOut = Math.min((1 + FADE - r.y01) / FADE, 1);
      const f = Math.min(fIn, fOut);
      r.mesh.material.opacity = f * f * (3 - 2 * f);
    }
  },
};
