import * as THREE from "https://esm.sh/three@0.160.0";

let shadowTexture = null;
export function getShadowTexture() {
  if (shadowTexture) return shadowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.65, "rgba(0,0,0,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  shadowTexture = new THREE.CanvasTexture(c);
  shadowTexture.colorSpace = THREE.SRGBColorSpace;
  return shadowTexture;
}

export function makeShadow(size = 1.1) {
  const g = new THREE.PlaneGeometry(size, size, 6, 6);
  g.rotateX(-Math.PI / 2);
  /* The quad lies flat on the ground tile the entity stands on, i.e. exactly on
     the terrain's own surface, and the two are coplanar to the last bit: the
     depth test then resolves to whichever of the two loses, which flickers as
     the camera moves. A polygon offset pulls the shadow a couple of depth units
     towards the camera so it always passes - the offset scales with the depth
     slope, so it holds at every camera distance without having to be re-tuned,
     and it is far too small to lift the shadow over the boots above it.

     The depth test is `LessDepth` (strict) rather than three.js's default
     `LessEqualDepth`. Default LEQUAL means "equal depth wins", i.e. last-drawn
     - so at the exact centre of the quad, where the offset depth happens to
     land on the same 24-bit value as whatever is already there (the ground, or
     a boot standing on it), the shadow overwrites it and a dark speckle pops
     through the boots as the camera moves. Strictly-less means a tie always
     loses, so the shadow can only ever darken a pixel that is genuinely in
     front of the ground and behind the body - which is what a blob shadow is.
     The offset keeps it ahead of the terrain; the strict test keeps it behind
     the boots. */
  const m = new THREE.MeshBasicMaterial({
    map: getShadowTexture(),
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.LessDepth,
    opacity: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 2;
  mesh.userData.blobShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/* ------------------------------------------------------------------ sprites
   A flat, Y-axis-billboarded quad textured with real game artwork. The group
   origin sits at the sprite's feet (like makeCharacter's does), so the same
   position/height plumbing works for both. The quad's own local X is mirrored
   when the NPC faces the camera's right half, which is how the real client
   fakes the other facing directions from a single render. */

const WALK_BOB = 0.045;
const LEAN = 1.0;

export function makeSpriteBillboard(tex, height, aspect) {
  const width = height * aspect;
  const group = new THREE.Group();

  const geo = new THREE.PlaneGeometry(width, height);
  geo.translate(0, height / 2, 0);

  const mat = new THREE.MeshLambertMaterial({
    map: tex,
    transparent: false,
    alphaTest: 0.5,
    depthWrite: true,
    side: THREE.DoubleSide,
  });

  const plane = new THREE.Mesh(geo, mat);
  plane.renderOrder = 3;
  plane.rotation.order = "YXZ";
  group.add(plane);

  const shadow = makeShadow(Math.max(0.6, width * 0.6));
  group.add(shadow);

  const baseColor = new THREE.Color(1, 1, 1);

  return {
    group,
    plane,
    shadow,
    isSprite: true,
    width,
    height,
    side: 1,
    face(dir, yaw, pitch) {
      /* Billboarding about both axes, anchored at the sprite's feet: the
         quad is rotated to lie in the camera's screen plane, so the artwork
         always reads at its true aspect and never looks squashed by the
         overhead camera. */
      plane.rotation.set(-pitch * LEAN, yaw, 0);
      const s = Math.sin(dir - yaw);
      if (s > 0.18) this.side = -1;
      else if (s < -0.18) this.side = 1;
      plane.scale.x = this.side;
    },
    anim(phase = 0, moving = false, attack = 0) {
      plane.rotation.z = (moving ? Math.sin(phase) * 0.055 : 0) + attack * 0.16;
      plane.position.y = moving ? Math.abs(Math.sin(phase)) * WALK_BOB : 0;
      plane.scale.y = 1 + attack * 0.05;
    },
    flash(strength) {
      const s = Math.max(0, Math.min(1, strength || 0));
      baseColor.setRGB(1, 1 - s * 0.65, 1 - s * 0.65);
      mat.color.copy(baseColor);
    },
    dispose() {
      mat.dispose();
      geo.dispose();
    },
  };
}

const SKIN_DEFAULT = 0xe6b58c;

export function makeCharacter(cfg = {}) {
  const skin = cfg.skin ?? SKIN_DEFAULT;
  const shirt = cfg.shirt ?? 0x3f6fa5;
  const pants = cfg.pants ?? 0x4a4a52;
  const hair = cfg.hair ?? 0x4b3220;
  const shoes = cfg.shoes ?? 0x3a2c1e;
  const sleeves = cfg.sleeves ?? shirt;

  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, color, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = box(0.62, 0.72, 0.38, shirt, 0, 1.06);
  body.add(torso);

  const head = new THREE.Group();
  head.position.set(0, 1.42, 0);
  body.add(head);
  head.add(box(0.6, 0.58, 0.56, skin, 0, 0.29));
  head.add(box(0.64, 0.22, 0.6, hair, 0, 0.52));
  head.add(box(0.64, 0.34, 0.16, hair, 0, 0.3, -0.24));
  const eyeL = box(0.09, 0.1, 0.04, 0x2b2b2b, -0.13, 0.31, 0.29);
  const eyeR = box(0.09, 0.1, 0.04, 0x2b2b2b, 0.13, 0.31, 0.29);
  head.add(eyeL, eyeR);
  head.add(box(0.09, 0.14, 0.09, skin, 0, 0.22, 0.3));

  const armL = new THREE.Group();
  armL.position.set(-0.42, 1.34, 0);
  body.add(armL);
  armL.add(box(0.2, 0.64, 0.22, sleeves, 0, -0.32));
  armL.add(box(0.19, 0.16, 0.21, skin, 0, -0.68));

  const armR = new THREE.Group();
  armR.position.set(0.42, 1.34, 0);
  body.add(armR);
  armR.add(box(0.2, 0.64, 0.22, sleeves, 0, -0.32));
  armR.add(box(0.19, 0.16, 0.21, skin, 0, -0.68));

  const legL = new THREE.Group();
  legL.position.set(-0.16, 0.7, 0);
  body.add(legL);
  legL.add(box(0.24, 0.72, 0.26, pants, 0, -0.36));
  legL.add(box(0.25, 0.12, 0.3, shoes, 0, -0.68, 0.02));

  const legR = new THREE.Group();
  legR.position.set(0.16, 0.7, 0);
  body.add(legR);
  legR.add(box(0.24, 0.72, 0.26, pants, 0, -0.36));
  legR.add(box(0.25, 0.12, 0.3, shoes, 0, -0.68, 0.02));

  const shadow = makeShadow(1.25);
  root.add(shadow);

  return {
    group: root,
    body,
    head,
    torso,
    armL,
    armR,
    legL,
    legR,
    shadow,
    parts: { head, torso, armL, armR, legL, legR },
    setColors(c) {
      if (c.shirt != null) torso.material.color.setHex(c.shirt);
      if (c.skin != null) {
        for (const m of head.children) if (m.material.color.getHex() === skin) m.material.color.setHex(c.skin);
      }
    },
  };
}

export function animateCharacter(ch, dt, state) {
  const { speed = 0, phase = 0, attack = 0 } = state;
  if (speed > 0.01) {
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    ch.legL.rotation.x = s * 0.75;
    ch.legR.rotation.x = -s * 0.75;
    ch.armL.rotation.x = -s * 0.55;
    ch.armR.rotation.x = s * 0.55;
    ch.body.position.y = Math.abs(s) * 0.055;
    ch.body.rotation.z = c * 0.02;
  } else {
    const t = performance.now() * 0.0016;
    const breathe = Math.sin(t) * 0.02;
    ch.legL.rotation.x *= Math.max(0, 1 - dt * 8);
    ch.legR.rotation.x *= Math.max(0, 1 - dt * 8);
    ch.armL.rotation.x *= Math.max(0, 1 - dt * 8);
    ch.armR.rotation.x *= Math.max(0, 1 - dt * 8);
    ch.body.position.y = breathe;
    ch.body.rotation.z = 0;
  }
  if (attack > 0) {
    ch.armR.rotation.x = -attack * 2.1;
    ch.body.rotation.y = attack * 0.35;
  } else {
    ch.body.rotation.y = 0;
  }
}
