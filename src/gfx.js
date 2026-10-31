import { makeModelCharacter, gfxData } from "./models3d.js";

/* --------------------------------------------------------------- spell gfx

   Every graphic a spell throws is a *spotanim* in the cache: an animated model
   with an authored sequence, played once and then dropped. They are baked into
   src/models/gfx.json by src/tools/cache-bake/gfx-bake-run.mjs from the same
   spell-gfx id list bake.mjs carries (see SPELL_GFX there), and each one
   arrives here as a normal character-shaped model with a single `play`
   sequence - so the CPU skinning in src/models3d.js draws it unchanged.

   Two things a spellbook needs from this module:

     Gfx.play(id, {x, z, height, target}) - the cast pose on the caster, the
                                      impact on the target, the splash on a
                                      miss; `target` makes the graphic ride a
                                      moving body
     Gfx.projectile({...})          - the travelling graphic between the two,
                                      which the client re-aims at its target
                                      every frame if the target walks (the real
                                      projectiles track their victim) and which
                                      fires a callback when it lands

   Heights. The content scripts give spotanim heights in the client's own scale
   (see scratch/ref/lc_spell_*.rs2: `spotanim_pl(lowlvlalchemy_casting, 92, 0)`
   is the alchemy swirl at the caster's chest). Those units are the model's own:
   a tile is 128 of them on every axis, so a height divides by exactly 128.
   Measured against the world it comes out right - the baked player model is
   1.578 tiles tall (src/models/player_male.json has scale 1/128 and a 202-unit
   body), so the standard 92 is 0.72 of a tile: mid-chest. These heights are
   authored for that body, which is why a graphic meant for a *creature* has to
   be scaled down to its own size (src/magic.js#bodyHeight). The projectile
   heights arrive one step earlier: the content's `spotanim_proj` numbers are
   packet bytes and the 317 client multiplies each by 4 (`projectileHeightStart =
   stream.getUnsignedByte() * 4`, 317_Client.java:7515), which is why the strike
   arc's `43,31` is 172/124 units - shoulder to upper chest. A `spotanim_pl`
   height is already in units and is not scaled. */

const HEIGHT_PER_UNIT = 1 / 128;
/* one client cycle, the unit animation sequence lengths are authored in */
const TICK_SECONDS = 0.02;

/* Spell graphics that always draw over everything else (renderOrder 999 with
   no depth test): Iban Blast's own 87/88/89, the standard spellbook blast, so
   its gather, missile and burst sit at the top of the render order wherever
   they play. Same pattern as BRIGHT_GFX below: keyed by graphic id, so every
   caller - player casts, creature casts, Iban's own charge - gets it without
   threading a flag through the shared strike path. */
const ON_TOP_GFX = new Set([87, 88, 89]);
function applyOnTop(ch) {
  ch.group.traverse((o) => {
    if (!o.isMesh) return;
    o.renderOrder = 999;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m) m.depthTest = false;
  });
}

export const Gfx = {
  view: null,
  live: [],
  projectiles: [],
  warned: false,

  /* The view object owns both the three.js scene (`.scene`) and the world whose
     terrain heights the graphics sit on (`.world`) - see src/scene.js. */
  setView(view) {
    if (this.view === view) return;
    this.clear();
    this.view = view;
  },

  clear() {
    for (const g of this.live) this.dispose(g);
    for (const p of this.projectiles) this.dispose(p);
    this.live.length = 0;
    this.projectiles.length = 0;
  },

  /* Play a spell graphic once at a tile. `height` is in client units, `delay`
     in client cycles - the content scripts' `spotanim_pl(gfx, height, delay)`
     as written, so a graphic with a delay does not exist until the delay is up
     (Charge's swirl, `spotanim_pl(teleport_casting, 128, 32)`).

     `dir` is the facing of the entity the graphic belongs to. The client does
     not draw a player's graphic as a free-standing object: it merges the
     spotanim model into the player's own model before drawing it
     (`Player.getAnimatedModel`, 317_Player.java:236), so the graphic inherits
     the body's rotation and its authored forward offset always lands in front
     of the caster. A caster graphic drawn at a fixed world rotation sits on the
     wrong side of the body whenever the player is not facing "north".

     `target` (optional) is a live entity the graphic belongs *on* - the victim
     of a spell it is the impact of, or the caster of a gather. While it lives
     the graphic rides the body, exactly like a missile in flight and for the
     same reason (see `projectile`): the content merges the graphic into the
     moving entity's own model, so a burst on a creature that steps away has to
     leave the tile it landed on and travel with it.

     `tint` (optional, a hex) multiplies every face colour of the graphic - see
     src/models3d.js#buildMesh. It is how a spell casts a shared graphic in its
     own colour, and since each instance builds its own material, two spells can
     play the same id in two different colours at the same instant (the two
     undead spells: src/magic.js#SPELL_FX).

     `seconds` (optional) overrides how long the instance lives. The default is
     the graphic's own sequence, which is the right answer for every spell: the
     burst is authored to be over when it is over. A **cape of accomplishment's
     graphic** is the one caller that needs the longer of the two clocks - the
     cache authors seven of those graphics SHORTER than the pose they belong to
     (the defence cape's slab is 204 cycles against its pose's 269, strength's
     barbell 431 against 479, hunter's 315 against 336, crafting's 379 against
     397, woodcutting's 588 against 600, ranged's 240 against 248, herblore's
     408 against 414), so playing them off their own length deleted the scene
     the emote is *about* - the barbell, the conjured shield, the tree, the
     net - from a third of a second to a second and a half before the pose
     ended. Handed the pose's own clock instead, `hold` clamps the graphic on
     its last authored frame and the props stay for as long as the emote does
     (src/game.js#playCapeEmote).

     `reverse` (optional) plays the graphic's own sequence backwards - see
     src/models3d.js#update. The teleport's arrival bubble is the one caller:
     the cache authors the vanish as a ball that shrinks into the caster's
     hands, and the far side of the jump opens with that same spotanim read
     backwards, so the ball grows back out of nothing and then fades away.

     `rate` (optional) plays the sequence faster (>1) or slower (<1) than
     authored: the clock advances `rate` seconds of animation per real second,
     and the lifetime is the sequence's own length divided by the rate, so the
     whole thing still ends exactly when it finishes. The Ancient teleport's
     brick column is the one caller (src/magic.js#ANCIENT_TELE) - it has to be
     over sooner without cutting any of its motion.

     `fwd` (optional) hangs the graphic that many tiles in *front* of the body
     it rides, along the body's own facing, instead of centred on it - and it
     stays there, re-hung off the rendered yaw every frame the body turns, the
     same rule the yaw itself follows below. Magic Imbue is the one caller
     (src/magic.js#552): its rune is held out in front of the hands, not inside
     the chest. */
  play(id, opts = {}) {
    const ch = gfxCharacter(id, opts.tint);
    if (!ch) return null;
    const rate = opts.rate || 1;
    let px = opts.x, pz = opts.z;
    if (opts.fwd) {
      const d = opts.dir || 0;
      px += Math.sin(d) * opts.fwd;
      pz += Math.cos(d) * opts.fwd;
    }
    const inst = {
      ch,
      target: opts.target || null,
      x: px,
      z: pz,
      h: (opts.height || 0) * HEIGHT_PER_UNIT,
      delay: (opts.delay || 0) * TICK_SECONDS,
      seq: opts.seconds != null && opts.seconds > 0 ? opts.seconds : sequenceSeconds(ch) / rate,
      life: 0,
      rate,
      fwd: opts.fwd || 0,
      /* play the graphic's own sequence backwards (src/models3d.js#update's
         `reverse`): the teleport's arrival bubble is the vanish's spotanim read
         backwards - it grows where the leaving ball shrank - so the far side of
         a teleport opens with the shape the near side closed on */
      reverse: !!opts.reverse,
    };
    if (ch.group) {
      ch.group.rotation.y = opts.dir || 0;
      /* a delayed graphic (Charge's `spotanim_pl(teleport_casting, 128, 32)`)
         does not exist until its delay is up - before the first skinned frame
         its buffers are still zeroed, so showing it would put a speck of
         degenerate triangles at the caster's feet */
      if (inst.delay > 0) ch.group.visible = false;
    }
    if ((opts.onTop || ON_TOP_GFX.has(id)) && ch.group) applyOnTop(ch);
    /* a per-instance size multiplier (the Iban Blast skull, which rides the
       victim bigger on bigger hits): the character is built fresh for every
       play, so there is no pooled scale to leak between casts. */
    if (opts.scale && ch.group) ch.group.scale.setScalar(opts.scale);
    this.place(inst, inst.x, inst.z);
    this.add(ch);
    this.live.push(inst);
    return inst;
  },

  /* A graphic flying from one tile to another. `target` (optional) is a live
     entity: for as long as it is alive the projectile keeps homing on it,
     exactly like the client's Projectile.trackTarget. `onArrive` runs on the
     frame the projectile reaches its destination.

     `delay` (in client cycles) is the gathering beat: the content's
     `spotanim_proj` delay, taken straight off the row. The graphic does not
     exist during it - the client only creates the projectile once the caster's
     hands have finished moving - so it is kept hidden until the launch frame.

     `hidden` is for a missile that should never be seen at all: it is still
     created and still flown, so it arrives (and fires `onArrive`) at exactly
     the moment it would have, but the ball itself is drawn by whatever the
     arrival does instead - see src/magic.js#MISSILE_IN_FLIGHT.

     `tint` (optional, a hex) is the missile's material tint, the same option
     `play` takes. */
  projectile(opts) {
    const ch = gfxCharacter(opts.gfx, opts.tint);
    if (!ch) {
      if (opts.onArrive) opts.onArrive({ x: opts.toX, z: opts.toZ });
      return null;
    }
    const inst = {
      ch,
      target: opts.target || null,
      fromX: opts.fromX,
      fromZ: opts.fromZ,
      fromH: (opts.fromH || 0) * HEIGHT_PER_UNIT,
      toX: opts.toX,
      toZ: opts.toZ,
      toH: (opts.toH || 0) * HEIGHT_PER_UNIT,
      duration: Math.max(0.05, opts.duration || 0.6),
      delay: (opts.delay || 0) * TICK_SECONDS,
      t: 0,
      hidden: !!opts.hidden,
      onArrive: opts.onArrive || null,
      /* Fired on the frame the delay runs out - the beat the missile comes
         into being, i.e. the instant a bolt is seen to leave the bow. A ranged
         shot's experience is paid out here (src/combat.js#shoot) so the drop
         arrives with the missile, not with the wound. A missile with no delay
         never passes through the launch frame below, so it fires at once. */
      onRelease: opts.onRelease || null,
      released: false,
      /* The client's launch angle, in its own `slope` units, or `null` for a
         missile that keeps to the straight line (see the note on the flight
         below). Only the dark bow's specials set it so far. */
      slope: opts.slope != null ? opts.slope : null,
      speed: 0,
      vz: 0,
      accel: 0,
      /* A ranged shot keeps running after the swing: the missile is created on
         the swing tick but only comes into being on the release beat
         (`delay`), and by then the shooter has run a tile or two closer. Left
         frozen, the bolt would appear over the tile the swing started on
         rather than out of the bow that loosed it - so the origin follows the
         shooter until the launch frame. `fromFn` returns the muzzle in the
         same units as `fromX`/`fromZ`/`fromH`, and `durationFn` re-times the
         flight to the distance actually flown, so the one-tick flight still
         holds from wherever the shot really left. The destination already
         tracks its victim the same way (below); this is the same rule for the
         other end. */
      fromFn: opts.fromFn || null,
      durationFn: opts.durationFn || null,
    };
    if (inst.fromFn) {
      let s = null;
      try { s = inst.fromFn(); } catch (e) { s = null; }
      if (s) {
        if (s.x != null) inst.fromX = s.x;
        if (s.z != null) inst.fromZ = s.z;
        if (s.h != null) inst.fromH = s.h * HEIGHT_PER_UNIT;
      }
    }
    if (ch.group) {
      ch.group.rotation.y = Math.atan2(inst.toX - inst.fromX, inst.toZ - inst.fromZ);
      /* Yaw first, then pitch: a lofted missile is tipped along its own arc,
         and the tip has to be measured after the body has been turned to face
         the target (`setFromEuler` applies `order` from the left). */
      ch.group.rotation.order = "YXZ";
      if (inst.delay > 0) ch.group.visible = false;
      if (inst.hidden) ch.group.visible = false;
      if (opts.onTop || ON_TOP_GFX.has(opts.gfx)) applyOnTop(ch);
    }
    if (inst.slope != null && !(inst.fromFn && inst.delay > 0)) launchArc(inst);
    this.place(inst, inst.fromX, inst.fromZ, inst.fromH);
    this.add(ch);
    this.projectiles.push(inst);
    /* No gathering beat: the missile is already leaving, so the release
       fires at once rather than waiting for a launch frame that never comes. */
    if (inst.delay <= 0 && inst.onRelease && !inst.released) {
      inst.released = true;
      try { inst.onRelease(); } catch (e) {}
    }
    return inst;
  },

  add(ch) {
    const s = this.view && this.view.scene;
    if (s && ch.group) s.add(ch.group);
  },

  /* Position a graphic instance on the terrain, `h` tiles above the ground. */
  place(inst, x, z, h) {
    const w = this.view && this.view.world;
    const gy = w ? w.heightAt(x, z) : 0;
    inst.ch.group.position.set(x, gy + (h == null ? inst.h : h), z);
  },

  dispose(inst) {
    const g = inst.ch.group;
    if (g && g.parent) g.parent.remove(g);
    if (inst.ch.dispose) inst.ch.dispose();
  },

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      if (g.delay > 0) {
        g.delay -= dt;
        /* the frame the gather ends, the graphic appears and starts playing -
           skinned once at dt=0 so its first visible frame is the pose itself
           rather than the still-zeroed buffers */
        if (g.delay <= 0 && g.ch.group) { g.ch.group.visible = true; g.ch.update(0, { cast: "play", oneShot: true, hold: true, reverse: g.reverse }); }
        continue;
      }
      /* A graphic played on a creature rides its body for as long as it is
         alive, the same rule the projectile loop below follows: the client
         merges the spotanim into the entity's own model, so an impact has to
         stay on a victim that walks away rather than sit on the tile it
         happened to be standing on when the spell landed. It tracks the
         *rendered* position (`rx`/`rz`), so it keeps pace with a body drawn
         part-way along its step. */
      if (g.target && !g.target.dead && g.target.x != null) {
        const tx = g.target.rx == null ? g.target.x : g.target.rx;
        const tz = g.target.rz == null ? g.target.z : g.target.rz;
        let fx = tx, fz = tz;
        /* A graphic hung in front of the body (see `fwd` in `play`) is re-hung
           off the body's rendered yaw every frame, so it stays in front of the
           hands however the caster turns - the same rule the yaw below obeys. */
        if (g.fwd) {
          let fyaw = g.target.dir;
          const ftg = g.target.ch && g.target.ch.group;
          if (ftg && ftg.rotation) fyaw = ftg.rotation.y;
          if (fyaw != null) { fx = tx + Math.sin(fyaw) * g.fwd; fz = tz + Math.cos(fyaw) * g.fwd; }
        }
        if (fx !== g.x || fz !== g.z) {
          g.x = fx;
          g.z = fz;
          this.place(g, fx, fz);
        }
        /* And it swivels about the body's vertical axis as the body turns.
           This is what "merged into the entity's own model" means for a
           graphic: the client draws the spotanim's vertices in the body's
           LOCAL space, so its authored forward offset is rotated by the body's
           facing every frame. Pinning the graphic's yaw once at play time (what
           this used to do) leaves it pointing wherever the caster happened to
           be facing when the cast began - so a Vengeance skull hangs off the
           wrong side of a character that turns, and any spell's gather graphic
           does the same. Every caster/impact graphic that carries a `target`
           takes this path, which is why it reads as one rule for the whole
           spellbook. The yaw it follows is the RENDERED one - the body's own
           group rotation, which turns towards a new facing gradually over
           frames (see game.js#stepRotation) - and not the logical `dir`, which
           snaps to the target the instant the swing starts. Pinned to the snap,
           the gather ball pops to the target's side before the hands have moved;
           pinned to the render yaw, it rides round with the hands in real time
           as the caster turns. */
        if (g.ch.group) {
          let yaw = g.target.dir;
          const tg = g.target.ch && g.target.ch.group;
          if (tg && tg.rotation) yaw = tg.rotation.y;
          if (yaw != null) g.ch.group.rotation.y = yaw;
        }
      }
      g.life += dt;
      /* `hold` (see src/models3d.js) plays the sequence once and keeps its last
         pose: a spotanim authored to shrink away must not loop its clock.
         `reverse` mirrors that clock, so the pose it keeps is the sequence's
         first frame instead. */
      g.ch.update(dt, { cast: "play", oneShot: true, hold: true, reverse: g.reverse, rate: g.rate || 1 });
      if (g.life >= g.seq) {
        this.dispose(g);
        this.live.splice(i, 1);
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.delay > 0) {
        p.delay -= dt;
        /* While the hands are still moving the muzzle moves with them: the
           shooter may run a tile closer between the swing and the release, and
           the bolt has to leave the bow where it is on the release beat, not
           where it was a tick ago. The arc and the flight time are solved from
           that final origin, so a lofted shot still lands exactly on its mark
           and the flight still costs the distance actually flown. */
        if (p.fromFn) {
          let s = null;
          try { s = p.fromFn(); } catch (e) { s = null; }
          if (s) {
            if (s.x != null) p.fromX = s.x;
            if (s.z != null) p.fromZ = s.z;
            if (s.h != null) p.fromH = s.h * HEIGHT_PER_UNIT;
          }
          if (p.ch.group) p.ch.group.rotation.y = Math.atan2(p.toX - p.fromX, p.toZ - p.fromZ);
        }
        /* the missile only comes into being when the hands have finished
           moving: until then it is off the screen entirely, and it is skinned
           once at dt=0 on the launch frame so it does not flash a speck. A
           `hidden` missile is never revealed at all - it flies unseen purely
           so that it lands on time. */
        if (p.delay <= 0) {
          if (p.slope != null && p.fromFn) launchArc(p);
          if (p.durationFn) p.duration = Math.max(0.05, p.durationFn(Math.hypot(p.toX - p.fromX, p.toZ - p.fromZ)));
          if (p.ch.group && !p.hidden) { p.ch.group.visible = true; p.ch.update(0, { cast: "play", oneShot: true }); }
          /* The launch frame: the missile exists from here on, so whatever
             was waiting on the release beat (a ranged shot's experience - see
             src/combat.js#shoot) runs now, exactly once. */
          if (p.onRelease && !p.released) {
            p.released = true;
            try { p.onRelease(); } catch (e) {}
          }
        }
        continue;
      }
      p.t += dt;
      const k = Math.min(1, p.t / p.duration);
      /* The destination tracks its victim while it is alive, so a creature that
         steps away is still hit where it stands. It follows the target's
         *rendered* position, not its tile: an entity between tiles is drawn
         part-way along its step and the projectile has to keep pace with the
         body on screen (the client re-aims its projectile at the victim's
         interpolated position every frame for the same reason). Without this
         the graphic would visibly lead or lag a walking creature by up to a
         tile. */
      let tx = p.toX, tz = p.toZ;
      if (p.target && !p.target.dead && p.target.x != null) {
        tx = p.target.rx == null ? p.target.x : p.target.rx;
        tz = p.target.rz == null ? p.target.z : p.target.rz;
      }
      const x = p.fromX + (tx - p.fromX) * k;
      const z = p.fromZ + (tz - p.fromZ) * k;
      /* Straight line for every missile that was not given a launch angle, and
         the client's own parabola for one that was (see `launchArc`). Evaluated
         from the flight clock rather than accumulated step by step, so a
         dropped frame cannot bend the arc - and both ends still land exactly on
         the two heights whatever the middle does. */
      const h = p.slope == null
        ? p.fromH + (p.toH - p.fromH) * k
        : p.fromH + p.t * (p.vz + 0.5 * p.accel * p.t);
      this.place(p, x, z, h);
      /* face along the flight path, so a graphic that is not symmetrical still
         points the way it is going as the path curves towards the target - and
         tip it along the arc's own tangent, which is the client's own `pitch`
         (`atan2(speedZ, speed)`), so a dragon head climbing away from the bow is
         drawn climbing rather than level */
      if (p.ch.group) {
        p.ch.group.rotation.y = Math.atan2(tx - p.fromX, tz - p.fromZ);
        if (p.slope != null) p.ch.group.rotation.x = -Math.atan2(p.vz + p.accel * p.t, p.speed);
      }
      if (!p.hidden) p.ch.update(dt, { cast: "play", oneShot: true, rate: p.rate || 1 });
      if (k >= 1) {
        this.dispose(p);
        this.projectiles.splice(i, 1);
        if (p.onArrive) p.onArrive({ x: tx, z: tz });
      }
    }
  },
};

/* The flight of a missile that was given a launch angle: the client's own
   projectile maths, solved once at launch.

   A 317-client projectile is not tweened along a straight line. Its
   `setDestination` (the client's own `Projectile`) solves a **constant vertical
   acceleration** that lands the graphic on the target's own height at the last
   cycle of its flight, and the angle it is loosed at is the packet's `slope`
   byte, in twentieths of a radian:

     speedZ = -speed * tan(0.02454369 * slope)
     accelZ = (toH - fromH - speedZ * duration) * 2 / duration^2
     z(t)   = fromH + t * speedZ + t^2 * accelZ / 2
     pitch  = atan2(speedZ + t * accelZ, speed)

   `speed` is the graphic's horizontal pace (tiles per second here, per cycle in
   the client), so `slope` is simply the angle it leaves at - and **negative is
   upward**, which is the client's own sign: a 317 arrow is loosed with a
   negative slope and drops onto its mark. Because the acceleration is solved
   from the two heights, ANY slope still lands exactly on `toH` at
   `t = duration`, so one number is all a caller has to give: the loft, and the
   arc through the two heights falls out of it (0 is the client's gravity-only
   flight - flat out of the bow when the target is level, dipping onto one that
   is below).

   Every missile in this world flew a straight line until the dark bow's special
   needed to arc - its arrows are the "Descent", loosed high and dropped onto the
   mark - so the curve is opt-in. A missile with no `slope` is placed exactly as
   it was before; a caller that wants the client's flight passes one. */
function launchArc(inst) {
  const dist = Math.hypot(inst.toX - inst.fromX, inst.toZ - inst.fromZ);
  inst.speed = dist / inst.duration;
  inst.vz = -inst.speed * Math.tan(0.02454369 * inst.slope);
  inst.accel = (inst.toH - inst.fromH - inst.vz * inst.duration) * 2 / (inst.duration * inst.duration);
}

/* Graphics drawn **solid** rather than as the cache authors them.

   The cache authors some spell bursts with per-face alpha - an alpha array, and
   a run of type-5 framemap entries that move it - which buildMesh draws blended
   and see-through (`models3d.js`'s `hasAlpha`/`blended`). Saradomin Strike's
   bolt (spotanim 76, the `end` graphic of spell 61, src/magic.js#SPELL_FX) is
   one of them: measured live, every face's drawn opacity sits around 1/256 for
   most of its 24 frames, so the bolt reads as a faint ghostly white zigzag with
   the grass showing through it. The user's report was exactly that - "remove the
   alpha effect from saradomin strike" - and the fix is to draw that graphic
   without the alpha path at all (see `makeModelCharacter`'s `opaque`), so it is
   solid and writes depth like any other model.

   This is a *per-graphic* list and not a rule for the spellbook: Guthix's claws
   (77), Zamorak's flames (78), the Ancient bursts and every other authored-alpha
   burst are deliberately left as the cache draws them. The graphic's shape,
   timing, colour, height and damage are all untouched - only its opacity. */
const OPAQUE_GFX = new Set([76]);

const BRIGHT_GFX = {
  83: { ambient: 60, contrast: 60, lift: 24 },
  /* The Superior Blast's split halves (src/tools/cache-bake/derive-spike83.mjs):
     the bolt carries 83's reds, so it takes the same lift; the base carries the
     light spokes, which only ever needed the lights. */
  "83bolt": { ambient: 60, contrast: 60, lift: 24 },
  "83base": { ambient: 60, contrast: 60, lift: 0 },
};
const BRIGHT_REDS = new Set([906, 910, 914, 918, 922, 926]);
function brightenGfx(id) {
  const spec = BRIGHT_GFX[id];
  if (!spec) return;
  const raw = gfxData.get("gfx" + id);
  if (!raw || raw._brightened) return;
  raw._brightened = true;
  raw.lightAmbient = spec.ambient;
  raw.lightContrast = spec.contrast;
  const bytes = atob(raw.colors);
  const pal = new Uint16Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < pal.length; i++) pal[i] = bytes.charCodeAt(i * 2) | (bytes.charCodeAt(i * 2 + 1) << 8);
  for (let i = 0; i < pal.length; i++) {
    if (!BRIGHT_REDS.has(pal[i])) continue;
    pal[i] = (pal[i] & 0xff80) + Math.min(96, (pal[i] & 127) + spec.lift);
  }
  const u8 = new Uint8Array(pal.buffer);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  raw.colors = btoa(s);
}

/* The initialised character render for a spell graphic. The CPU skinner owns
   per-instance buffers, so each live graphic gets its own render rather than
   sharing one - there are never more than a handful alive at once. */
function gfxCharacter(id, tint) {
  brightenGfx(id);
  const opts = {};
  if (tint != null) opts.tint = tint;
  if (OPAQUE_GFX.has(id)) opts.opaque = true;
  const ch = makeModelCharacter("gfx" + id, opts);
  if (!ch && !Gfx.warned) {
    Gfx.warned = true;
    console.warn("[gfx] spell graphic " + id + " is not baked (src/models/gfx.json)");
  }
  return ch;
}

/* How high a live graphic reaches *on the screen*: the projected row of its
   topmost vertex, in overlay pixels from the top of the viewport.

   This exists for the overhead health bars (src/fx.js#renderBars). A graphic is
   played at a *tile* height - the content's `spotanim_target,windstrike_impact,
   124` puts Wind Strike's burst 124 units (0.97 tiles) over the ground, which is
   above the head of anything shorter than a cow - so a bar has to be lifted out
   of the blast rather than the other way round (the height is content, and the
   real client puts a burst over the tile whatever it lands on).

   The lift cannot be taken from the model's declared height (`ch.height`, off
   the baked bounds): that is the base pose alone, and these effects breathe -
   Wind Strike's impact declares 0.22 tiles but its skinned frames reach 0.64
   above the tile it is played on, and the ball flown in with it reaches further
   still. The vertices are what is on the screen, so the vertices are measured -
   through the camera, and not as a world height.

   A world height would not do. The overlay is screen space, so what matters is
   the highest *pixel*, and under a perspective camera a vertex that is nearer
   the camera is drawn higher than a farther vertex that is genuinely higher off
   the ground. A burst is wider than it is tall, so its near side wins the top
   row by several pixels: measured on a chicken at the default camera, the
   world-height answer left a bar 5 px over the blast, and this one leaves none.
   (The drawn pose itself is CPU-skinned into the position attribute by
   src/models3d.js, so the attribute *is* the pose - there are no bone matrices
   to chase.)

   `x`/`z` are the tile the graphic is over. Returns null for a graphic that is
   not drawn (still inside its delay, or a missile flown `hidden`), which is also
   the answer that costs nothing. */
let _screenTopVec = null;
export function gfxScreenTop(inst, cam, vh) {
  const g = inst && inst.ch && inst.ch.group;
  if (!g || !g.visible || !cam) return null;
  g.updateMatrixWorld(true);
  /* a Vector3 borrowed from the group itself, so this module needs no import */
  const v = _screenTopVec || (_screenTopVec = g.position.clone());
  let top = Infinity;
  g.traverse(o => {
    const p = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (!p) return;
    const a = p.array;
    const m = o.matrixWorld.elements;
    const n = p.itemSize;
    for (let i = 0; i + 2 < a.length; i += n) {
      v.set(m[0] * a[i] + m[4] * a[i + 1] + m[8] * a[i + 2] + m[12],
            m[1] * a[i] + m[5] * a[i + 1] + m[9] * a[i + 2] + m[13],
            m[2] * a[i] + m[6] * a[i + 1] + m[10] * a[i + 2] + m[14]);
      v.project(cam);
      if (v.z > 1) continue;
      const row = (-v.y * 0.5 + 0.5) * vh;
      if (row < top) top = row;
    }
  });
  if (top === Infinity) return null;
  return { x: g.position.x, z: g.position.z, screenTop: top };
}

/* How long the graphic's single authored sequence runs, in seconds. */
function sequenceSeconds(ch) {
  const a = ch.data && ch.data._anims && ch.data._anims.play;
  return a ? Math.max(0.05, a.totalTicks * TICK_SECONDS) : 0.5;
}

export function initGfx(view) {
  Gfx.setView(view);
  return Gfx;
}
