/* ==========================================================================
   FiDo-5 — Bosses.
   A boss is a sector gate: the camera stops, the walls come in, and the run
   does not continue until the thing in front of you is dead.

   The state machine is deliberately readable, because every attack has to be
   readable too. A boss that kills you without warning is a bug in a game
   whose whole first minute teaches you to watch for a telegraph.

   Lives are spent here and nowhere else — see Game._onDeath.
   ========================================================================== */

import { WORLD, BOSSES, BOSS_ATTACKS, ENEMIES, SECTORS } from './data.js';
import { clamp } from './world.js';

/* Phases, in the order they cycle:
     wait     — pacing, choosing what to do next
     telegraph— winding up, attack colour showing, still armoured
     strike   — the attack lands
     recover  — core exposed, armour off: this is the damage window
     dying    — death throes, then the gate opens */

export class Boss {
  constructor() {
    this.active = false;
    this.def = null;
    this.dying = 0;
    this.shots = [];        // arcing flak and relay fire in flight
    this.waves = [];        // stomp shockwaves in flight
    this.beams = [];        // sweep beams in flight
    this.parts = [];        // relays and the like, each killed separately
    this.brood = [];        // enemies a carrier has put in the air
  }

  /* `pass` is how many times the roster has looped; each pass hardens it. */
  spawn(ctx, def, arena, pass = 0) {
    const hpMul = 1 + pass * 0.55;
    this.def = def;
    this.active = true;
    this.arena = arena;
    this.pass = pass;
    this.maxHp = Math.round(def.health * hpMul);
    this.hp = this.maxHp;
    this.tier = def.tier;
    /* A moving boss has no arena to enter. It keeps station on the camera
       instead, and cruises above everything the player can shoot at. */
    this.moving = def.arena === 'moving';
    // A gunship cruises above the firing line; a crawler keeps to the street
    // and is unreachable for a different reason — it is behind you.
    this.cruiseY = def.hugGround ? WORLD.tierY[0] - def.h / 2 : WORLD.tierY[2] - 26;
    // Where the camera was when it spawned, so the first frame's carry is zero
    // rather than the distance between the camera and the arena's near edge.
    this.lastCam = ctx && ctx.run ? ctx.run.camX : arena.startX;
    // Enters from the far end of the arena, facing the player — but never so
    // close to the wall that whatever it carries hangs off the screen.
    this.phase2 = false;
    this.stage = -1;             // how far down the stage list it has fallen
    this.armourOverride = null;
    this.attacksOverride = null;
    this.telegraphOverride = null;
    this.labelOverride = null;
    this.partsOverride = null;
    this.cycleOverride = null;
    /* State belonging to the attacks added after the first six. Each one is
       reset here rather than lazily, so a second fight against the same boss
       can never inherit a raised shield or a street still on fire. */
    this.guarding = false;       // Bulwark's slab is up
    this.returns = 0;            // shots it has thrown back this guard
    this.embedded = false;       // Thresher is stuck in the street
    this.markX = 0;              // where a dive is going to land
    this.flood = 0;              // s of coolant left on the street
    this.floodTick = 0;
    this.charging = false;       // Arbiter's meter is filling
    this.charge = 0;             // damage landed on it while it fills
    this.purge = 0;              // s of purge flash left
    this.safeTier = 0;           // the level a purge will not burn
    this.diveHit = false;        // the dive has already caught the player
    this.healT = 0;              // next "FEEDING" callout
    this.brood = [];
    // A boss that hunts from behind has to arrive from behind, or it spends the
    // opening of the fight flying backwards past the player to take station.
    this.x = (def.station || 0) < 0
      ? arena.startX + this.margin + def.w / 2
      : arena.endX - this.margin - def.w / 2;
    this.y = this.moving ? this.cruiseY : WORLD.tierY[def.tier] - def.h / 2;
    // A boss that holds the ceiling starts on it, rather than flying up to it
    // through the intro with the name plate still on screen.
    if (def.perch) this.y = this.perchY;
    this.vx = 0;
    this.dir = -1;
    this.phase = 'wait';
    this.t = 0;
    this.phaseT = 1.2;
    this.attack = null;
    this.flash = 0;
    this.hitT = 0;
    this.shots = [];        // arcing flak and relay fire
    this.waves = [];        // stomp shockwaves
    this.beams = [];        // Hexcell's sweep
    this.collapsed = [];    // walkway columns already taken away
    this.homeY = this.y;
    this.parts = [];
    if (def.parts) this._buildParts(def.parts);
    this.dying = 0;
    this.hold = false;      // true during the intro: stands, does not fight
    // Animation: how far the body is lifted (negative is up), how hard it is
    // squashed, and how far it has recoiled from its own shot. The renderer
    // reads these; nothing here needs to know how it is drawn.
    this.atkIdx = 0;        // for bosses that cycle their attacks in order
    this.lift = 0;
    this.squash = 0;
    this.recoil = 0;
    this.step = 0;          // walk cycle phase
    this.speedMul = 1 + pass * 0.15;
  }

  /* Parts come in two layouts. Orbiting ones ring the body and start evenly
     spaced, so the opening read is "three of them" and not "a cluster";
     mounted ones sit one per tier, which is what makes a fight about moving
     between tiers rather than around a circle. */
  _buildParts(pd) {
    this.parts.length = 0;
    for (let i = 0; i < pd.count; i++) {
      const q = {
        i, alive: true, hp: pd.health, maxHp: pd.health, flash: 0, respawnT: 0,
        a: (i / pd.count) * Math.PI * 2,
        tier: pd.layout === 'tiers' ? i % WORLD.tierCount : 0,
        off: pd.layout === 'tiers' && pd.count > 1
          ? -(i / (pd.count - 1)) * pd.spread : 0,
      };
      q.x = this.x + q.off;
      q.y = pd.layout === 'tiers' ? WORLD.tierY[q.tier] - pd.h / 2 : this.y;
      this.parts.push(q);
    }
  }

  clear() {
    this.active = false;
    this.shots.length = 0;
    this.waves.length = 0;
    this.beams.length = 0;
    this.parts.length = 0;
    this.brood.length = 0;
    this.guarding = false;
    this.charging = false;
    this.flood = 0;
    this.purge = 0;
  }

  /* Where a perching boss sits when it is not diving, and how deep into the
     street it buries itself when it is. The perch is clear of the rooftop
     line, in the same band the Convoy cruises in: there is no platform up
     there and nothing standing on a ledge reaches it, so the only way to get
     at it is to make it come down. */
  get perchY() { return WORLD.tierY[2] - this.def.h / 2 - 10; }
  get embedY() { return WORLD.tierY[0] - this.def.h / 2 + 9; }

  /* A boss with parts is exposed when every one of them is down; a boss
     without them is exposed in the moment after it attacks. Two different
     fights, one word for "hit it now". */
  get exposed() {
    // A perching boss is open when — and only when — it is stuck in the
    // street. Anywhere else the phase may say "recover" while the core is
    // sitting well above anything the player can shoot.
    if (this.def.perch) return this.embedded;
    const pd = this.partDef;
    // Parts only gate exposure where the design says they do: Hexcell's relays
    // are a shield, the Choir's pods are plating and Null Prime's drones are
    // just company.
    if (this.parts.length && pd && pd.gates !== false) return this.parts.every((q) => !q.alive);
    return this.phase === 'recover';
  }
  get liveParts() { return this.parts.reduce((n, q) => n + (q.alive ? 1 : 0), 0); }
  get partDef() { return this.partsOverride || this.def.parts; }

  /* Stages, in the order the bar falls past them. `phase2` is the one-entry
     form and is still what most of the roster uses; `stages` is the same idea
     written out, for a boss that changes its mind more than once. */
  get stages() {
    if (this.def.stages) return this.def.stages;
    return this.def.phase2 ? [this.def.phase2] : [];
  }

  /* Every member of the brood that is still in the air. A pooled enemy can be
     recycled into something else entirely, so the id is checked as well as
     the slot: the count has to be of *this* carrier's children. */
  get liveBrood() {
    let n = 0;
    for (const b of this.brood) {
      if (b.e.alive && b.e.broodId === b.id && b.e.dying <= 0) n++;
    }
    return n;
  }

  /* A boss that changes form part-way through overrides these three rather
     than being a second definition: same body, same bar, different rules. */
  get armourVal() { return this.armourOverride == null ? this.def.armour : this.armourOverride; }
  get attackPool() { return this.attacksOverride || this.def.attacks; }
  get cycles() { return this.cycleOverride == null ? this.def.cycleAttacks : this.cycleOverride; }
  get telegraphT() {
    // The overload brings its own wind-up: it is a meter the player is racing
    // rather than a tell they are reading, and it has to be long enough to
    // cross the arena and break something.
    if (this.attack === 'overload') return BOSS_ATTACKS.overload.charge;
    return this.telegraphOverride == null ? this.def.telegraph : this.telegraphOverride;
  }

  /* What the bar calls its defence right now. Two of the new bosses change
     that mid-fight, and a bar that goes on saying PLATED while nothing at all
     is getting through reads as a broken bar. */
  get armourLabel() {
    if (this.def.submerged && this.flood > 0) return 'SUBMERGED';
    if (this.guarding) return 'SHIELD UP';
    return this.labelOverride || this.def.armourLabel || 'ARMOURED';
  }

  /* How far from a wall the body has to stay. A boss with orbiting parts needs
     room for them too, or a relay spends the fight outside the arena where it
     cannot be shot. */
  /* How far from a wall the body has to stay. Orbiting parts need room on
     both sides; mounted ones trail back towards the player, so they need none
     on the far side — which is what lets an immobile boss stand against the
     far wall with nothing behind it for the player to hide in. */
  get margin() {
    // partDef rather than def.parts, so a boss that only grows its ring in a
    // later stage starts keeping room for it the moment the ring exists.
    const pd = this.partDef;
    if (!pd) return this.def.w / 2;
    return this.def.w / 2 + (pd.layout === 'tiers' ? pd.w / 2 : pd.orbit);
  }
  get hpFrac() { return this.maxHp > 0 ? clamp(this.hp / this.maxHp, 0, 1) : 0; }

  /* ---- Damage --------------------------------------------------------- */

  /* The damage multiplier a hit would actually get right now. One place, so
     the bar can never claim a boss is protected while the maths says it is
     taking everything. */
  get armourNow() {
    // Two states that outrank everything else, because in both of them
    // literally nothing is getting through and the bar has to say so.
    if (this.guarding) return 0;                            // behind the slab
    if (this.def.submerged && this.flood > 0) return 0;     // under its own flood
    if (this.exposed) return 1;
    const pd = this.partDef;
    // Plating that comes off a piece at a time: each part silenced is a third
    // (or a quarter) of the armour gone, so clearing them is worth doing even
    // where they are not a shield in their own right.
    if (pd && pd.softens && this.parts.length) {
      const gone = this.parts.length - this.liveParts;
      return this.armourVal + (1 - this.armourVal) * (gone / this.parts.length);
    }
    return this.armourVal;
  }

  hurt(ctx, amount) {
    if (!this.active || this.dying > 0 || this.hold) return 0;
    const dealt = amount * this.armourNow;
    this.hp = Math.max(0, this.hp - dealt);
    this.flash = 0.12;
    this.hitT = 0.2;
    /* Damage landed during a wind-up is what breaks an overload — and on the
       body it counts *after* armour. That is the whole reason the capacitors
       exist: three seconds of rifle fire into insulated plating comes nowhere
       near the threshold, and the same three seconds spent on a capacitor
       clears it twice over. Hosing the body and hoping is meant to lose. */
    if (this.charging) this.charge += dealt;
    if (this.hp <= 0) this._die(ctx);
    else this._checkStage(ctx);
    return dealt;
  }

  /* Has the bar fallen past the next stage? Walked one at a time rather than
     jumped to the last one crossed, so a single enormous hit still plays both
     transformations and the player is never shown a boss whose rules changed
     twice while they were watching a number. */
  _checkStage(ctx) {
    const list = this.stages;
    const next = list[this.stage + 1];
    if (next && this.hp <= this.maxHp * next.at) {
      this.stage++;
      this._shed(ctx, next);
    }
  }

  /* A stage boundary. Everything about the boss changes at once — armour,
     attacks, wind-up, what is orbiting it — because that is the point of a
     new form, and it has to be loud. */
  _shed(ctx, p2) {
    this.phase2 = true;
    this.armourOverride = p2.armour;
    this.attacksOverride = p2.attacks;
    this.telegraphOverride = p2.telegraph;
    if (p2.armourLabel) this.labelOverride = p2.armourLabel;
    if (p2.cycleAttacks !== undefined) this.cycleOverride = p2.cycleAttacks;
    this.speedMul *= p2.speedMul || 1;
    this.atkIdx = 0;
    this.charging = false;
    this.guarding = false;
    if (p2.parts) { this.partsOverride = p2.parts; this._buildParts(p2.parts); }
    this._enter('recover', this.def.recover);
    ctx.audio.play('explosion');
    ctx.shake && ctx.shake(8);
    ctx.particles.explode(this.x, this.y, 1.6, 'P');
    for (let i = 0; i < 5; i++) {
      ctx.particles.debris(this.x + (Math.random() - 0.5) * this.def.w,
        this.y + (Math.random() - 0.5) * this.def.h, 'M');
    }
    ctx.announce && ctx.announce(p2.announce || 'SECOND FORM', this.def.name, '#8b5cf6');
  }

  /* A relay taking a hit. Returns the damage dealt, or 0 if it was already
     down — the caller uses that to decide whether the shot was consumed. */
  hurtPart(ctx, part, amount) {
    if (!part.alive || this.hold || this.dying > 0) return 0;
    part.hp -= amount;
    part.flash = 0.12;
    if (this.charging) this.charge += amount;
    if (part.hp <= 0) {
      part.alive = false;
      part.respawnT = this.partDef.respawn;
      ctx.audio.play('explosion');
      ctx.particles.explode(part.x, part.y, 0.7, 'P');
      // Say what just changed, because the shield state is the whole fight.
      if (this.exposed) ctx.floater && ctx.floater(this.x, this.y - this.def.h / 2 - 8, 'SHIELD DOWN', 'Y', 1);
    }
    return amount;
  }

  _die(ctx) {
    this.dying = 1.6;
    this.phase = 'dying';
    this.guarding = false;
    this.charging = false;
    // The street goes out with it. A player killed by a puddle belonging to
    // something that is already scrap would rightly call that a bug.
    this.flood = 0;
    this.shots.length = 0;
    this.waves.length = 0;
    this.beams.length = 0;
    for (const q of this.parts) q.alive = false;
    ctx.audio.play('explosion');
  }

  /* ---- Update --------------------------------------------------------- */

  update(dt, ctx) {
    if (!this.active) return;
    const p = ctx.player;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.hitT = Math.max(0, this.hitT - dt);

    if (this.dying > 0) {
      this.dying -= dt;
      if (Math.random() < 0.5) this._debris(ctx);
      if (this.dying <= 0) this.active = false;   // _sector picks the clear up
      return;
    }

    // Held for the intro: it breathes, and nothing else.
    if (this.hold) return;

    // The screen is the arena for a moving boss: the clamps that keep a static
    // boss inside its walls keep this one inside the viewport instead.
    if (this.moving) {
      const cam = ctx.run.camX;
      this.arena = { startX: cam + 16, endX: cam + WORLD.viewW - 10 };
      this._updateFlight(dt, ctx);
    }

    // A perching boss owns its own altitude, and only the dive is allowed to
    // change it. Everything else holds the ceiling.
    if (this.def.perch) this._updatePerch(dt);

    this._updateAnim(dt);
    this._updateWaves(dt, ctx);
    this._updateShots(dt, ctx);
    this._updateBeams(dt, ctx);
    this._updateParts(dt, ctx);
    this._updateFlood(dt, ctx);
    this._updateBrood(dt, ctx);
    this.purge = Math.max(0, this.purge - dt);

    this.phaseT -= dt;
    switch (this.phase) {
      case 'wait':      this._wait(dt, ctx, p); break;
      case 'telegraph': if (this.phaseT <= 0) this._strike(ctx, p); break;
      case 'strike':
        if (this.attack === 'charge') this._charge(dt, ctx, p);
        if (this.attack === 'strafe' || this.attack === 'lunge') this._strafe(dt, ctx, p);
        if (this.attack === 'dive') this._dive(dt, ctx, p);
        if (this.phaseT <= 0) this._enter('recover', this.def.recover);
        break;
      case 'recover':   if (this.phaseT <= 0) this._enter('wait', 0.5 + Math.random() * 0.7); break;
    }

    // Walking into it hurts, so it cannot be simply stood on top of. This is a
    // real hit rather than a per-frame trickle: the invulnerability window the
    // hit opens is what stops it landing again on the very next frame.
    if (this._overlaps(p)) this._hit(ctx, this.def.contact);
  }

  /* The body's own movement, kept out of the attack code so a new attack does
     not have to remember to animate itself.

     A stomp reads as a stomp because the thing rears up first: the wind-up is
     the animation, and without it the shockwave appears out of a boss standing
     perfectly still. */
  _updateAnim(dt) {
    const ease = (v, to, rate) => v + (to - v) * Math.min(1, rate * dt);
    let wantLift = 0;
    if (this.phase === 'telegraph' && this.attack === 'stomp') {
      // Rear up over the wind-up, all the way to the moment it lands.
      const k = 1 - Math.max(0, this.phaseT) / this.def.telegraph;
      wantLift = -7 * k;
      this.squash = ease(this.squash, -0.12 * k, 14);   // stretched tall
    } else if (this.phase === 'strike' && this.attack === 'stomp') {
      wantLift = 2;
      this.squash = ease(this.squash, 0.22, 40);        // slammed flat
    } else {
      this.squash = ease(this.squash, 0, 9);
    }
    this.lift = ease(this.lift, wantLift, this.phase === 'strike' ? 42 : 12);
    this.recoil = Math.max(0, this.recoil - dt * 9);
    // A slow plod while it walks, so a boss crossing the arena is not sliding.
    if (!this.def.float && this.phase === 'wait') this.step += dt * 5;
  }

  /* Altitude is the fight. It cruises above the player's firing line and is
     effectively untouchable there; the strafe is the one manoeuvre that brings
     it down, and it stays down through the recovery afterwards. Everything the
     player gets, they get in that window. */
  _updateFlight(dt, ctx) {
    /* It flies. Carrying it along with the camera every frame is what makes
       that true: walkSpeed is then a relative speed, the few dozen pixels a
       second it trims its station by, rather than an absolute one that a
       sprinting player leaves behind inside a second. */
    const cam = ctx.run.camX;
    this.x += cam - this.lastCam;
    this.lastCam = cam;

    /* It comes down for every recovery, not only after a strafing run. Holding
       altitude through two attacks out of three left five and seven second
       stretches where the player could not touch it at all — dead air in a
       fight they are also running a level through. Dropping out of its firing
       arc to reset keeps the idea (it has to come down to be hurt) without the
       dead time. A strafe additionally comes down for the wind-up and the run,
       which is why it is still the attack that costs it the most. */
    const low = !this.def.hugGround && (this.phase === 'recover'
      || (this.attack === 'strafe' && (this.phase === 'telegraph' || this.phase === 'strike')));
    const want = low ? ctx.player.midY : this.cruiseY;
    const rate = low ? 150 : 70;
    this.y += Math.sign(want - this.y) * Math.min(Math.abs(want - this.y), rate * dt);
    this.low = Math.abs(this.y - this.cruiseY) > 12;

    /* Station-keeping runs in every phase but the strike, which is the one it
       is allowed to break formation for. It matters most during the recovery:
       a strafing run can end up behind a player who can only shoot forwards,
       and a damage window you cannot point a gun at is not a damage window.
       Coming back to station brings it back in front, still low. */
    if (this.phase !== 'strike') {
      /* Where "station" is depends on the boss. A gunship escorts from ahead;
         the Ripper hunts from behind, where a player who can only shoot
         forwards cannot answer it. Either way the recovery is spent in front,
         because that is the half of the fight the player is owed. */
      const behind = (this.def.station || 90) < 0;
      const off = (behind && this.phase === 'recover') ? 86 : (this.def.station || 90);
      const home = ctx.player.x + off;
      const step = this.def.walkSpeed * this.speedMul * (this.phase === 'recover' ? 3.4 : 1) * dt;
      if (Math.abs(home - this.x) > 4) this.x += Math.sign(home - this.x) * step;
    }

    // Kept on screen in every phase, not only while it is choosing what to do.
    this.x = clamp(this.x, this.arena.startX + this.def.w / 2,
                   this.arena.endX - this.def.w / 2);
  }

  /* The slab only stays up for as long as the strike it belongs to, so every
     route out of that phase — including one taken early — lowers it. */
  _enter(phase, time) {
    if (phase !== 'strike') this.guarding = false;
    this.phase = phase;
    this.phaseT = time;
  }

  /* ---- The perch, and the dive off it --------------------------------- */

  _updatePerch(dt) {
    // While the dive is running, _dive owns the altitude.
    if (this.phase === 'strike' && this.attack === 'dive') return;
    const want = this.embedded ? this.embedY : this.perchY;
    const rate = this.embedded ? 240 : 110;
    this.y += Math.sign(want - this.y) * Math.min(Math.abs(want - this.y), rate * dt);
  }

  /* Straight down, onto the column it marked at the top of the wind-up. It
     does not steer on the way — the marker is a promise, and a promise a boss
     breaks halfway down is just a hit the player could not have avoided. */
  _dive(dt, ctx, p) {
    const a = BOSS_ATTACKS.dive;
    this.y += a.speed * this.speedMul * dt;
    this.x += (this.markX - this.x) * Math.min(1, 7 * dt);
    if (Math.random() < 0.7) {
      ctx.particles.thruster(this.x, this.y - this.def.h / 2, 'R');
    }
    if (!this.diveHit && this._overlaps(p)) {
      this.diveHit = true;
      this._hit(ctx, a.damage);
    }
    if (this.y < this.embedY) return;

    // Landing. Everything that makes the dive worth baiting happens here.
    this.y = this.embedY;
    this.embedded = true;
    this.squash = 0.25;
    ctx.audio.play('explosion');
    ctx.shake && ctx.shake(9);
    for (const off of [-10, 10]) {
      ctx.particles.dust(this.x + off, WORLD.tierY[0]);
      ctx.particles.debris(this.x + off, WORLD.tierY[0] - 2, 'S');
    }
    for (const dir of [-1, 1]) {
      this.waves.push({ x: this.x, dir, life: a.waveLife, hit: false,
                        dmg: a.damage, speed: a.waveSpeed });
    }
    if (a.collapse) this._collapse(ctx);
    // Buried, and open for as long as it takes to pull itself out. This is
    // the whole damage window of the fight.
    this._enter('recover', a.embed);
  }

  /* ---- The slab ------------------------------------------------------- */

  /* Is this shot going into the slab? Asked by the bullet code before it
     looks at the parts or the body, because while the shield is up there is
     nothing behind it worth testing. */
  blocks(b) {
    if (!this.guarding) return false;
    const hw = this.def.w / 2, hh = this.def.h / 2;
    // The slab stands proud of the leading edge, so a shot is stopped a little
    // short of the body rather than on it — the player sees where it went.
    const front = this.x + this.dir * (hw + 10);
    const x0 = Math.min(this.x - hw, front), x1 = Math.max(this.x + hw, front);
    return b.x > x0 && b.x < x1 && b.y + 2 > this.y - hh && b.y - 2 < this.y + hh;
  }

  /* ...and what happens to it. It goes back down the line it came in on,
     which is what makes the guard a punishment for holding the trigger rather
     than a plain immunity window. Capped per guard: a machine pistol should
     cost its owner a lesson, not the run. */
  deflect(ctx, b) {
    const a = BOSS_ATTACKS.guard;
    ctx.audio.play('hit.shielded');
    ctx.particles.impact(b.x, b.y, 'A');
    if (this.returns >= a.maxReturns) return;
    this.returns++;
    const p = ctx.player;
    const ang = Math.atan2(p.midY - b.y, p.x - b.x);
    this.shots.push({
      x: b.x, y: b.y,
      vx: Math.cos(ang) * a.returnSpeed, vy: Math.sin(ang) * a.returnSpeed,
      grav: 0, life: 2.2, dmg: a.returnDamage,
    });
  }

  /* ---- The flood ------------------------------------------------------ */

  /* Coolant across the street. It only catches a player standing in it, so
     the answer is the walkway — and the walkway is where the Dredge's spit is
     aimed, which is why the two are cycled one after the other. */
  _updateFlood(dt, ctx) {
    if (this.flood <= 0) return;
    this.flood -= dt;
    const a = BOSS_ATTACKS.flood;
    const p = ctx.player;
    this.floodTick -= dt;
    if (this.floodTick <= 0 && p.tier === 0 && p.grounded && !p.dead) {
      this.floodTick = a.tick;
      this._hit(ctx, a.damage);
      ctx.particles.dust(p.x, WORLD.tierY[0]);
    }
    if (Math.random() < 0.5) {
      const x = this.arena.startX + Math.random() * (this.arena.endX - this.arena.startX);
      ctx.particles.dust(x, WORLD.tierY[0] - 2);
    }
  }

  /* ---- The brood ------------------------------------------------------ */

  /* A carrier feeds on what it puts in the air: while any of its children are
     alive the bar climbs, and it climbs faster than most weapons empty it. So
     the sky comes first, and the hull second. */
  _updateBrood(dt, ctx) {
    const bd = this.def.brood;
    if (!bd) return;
    // Forget anything the pool has taken back, so the list cannot grow for the
    // length of a fight.
    for (let i = this.brood.length - 1; i >= 0; i--) {
      const b = this.brood[i];
      if (!b.e.alive || b.e.broodId !== b.id) this.brood.splice(i, 1);
    }
    const live = this.liveBrood;
    if (live <= 0 || this.dying > 0 || this.hold || this.hp >= this.maxHp) return;
    this.hp = Math.min(this.maxHp, this.hp + bd.regen * live * dt);
    this.healT = (this.healT || 0) - dt;
    if (this.healT <= 0) {
      this.healT = 1;
      ctx.floater && ctx.floater(this.x, this.y - this.def.h / 2 - 8, 'FEEDING', 'G', 1);
    }
  }

  /* ---- The purge ------------------------------------------------------ */

  /* The level a purge will not burn: the one the engine is furthest from. It
     tracks the player's height between attacks, so this is almost always the
     level they are *not* on — which is the point. Standing still through an
     overload has to cost something, or the interrupt is free.

     A walkway the fight has already torn out is not an escape route, so if
     tier 1 has been collapsed away the street is safe instead. */
  _safeTier(ctx) {
    let near = 0, best = Infinity;
    for (let t = 0; t < 2; t++) {
      const d = Math.abs((WORLD.tierY[t] - this.def.h / 2) - this.y);
      if (d < best) { best = d; near = t; }
    }
    const want = near === 0 ? 1 : 0;
    if (want === 1 && !this._tierExists(ctx, 1)) return 0;
    return want;
  }

  _tierExists(ctx, t) {
    const w = ctx.world;
    const a = this.arena;
    if (!w || !a || a.startCol === undefined) return true;
    for (let c = a.startCol; c <= a.endCol; c++) if (w.hasPlatform(c, t)) return true;
    return false;
  }

  /* The strafing run. It commits to a direction and crosses the screen at it,
     which is the same bargain the Warden's charge offers: the attack that
     hurts most is the attack that leaves it where you can reach it. */
  _strafe(dt, ctx, p) {
    const a = BOSS_ATTACKS[this.attack];
    this.x += this.dir * a.speed * this.speedMul * dt;
    if (Math.random() < 0.6) {
      ctx.particles.thruster(this.x + this.def.w / 2 * -this.dir, this.y, 'A');
    }
    if (this._overlaps(p) && !this.chargeHit) {
      this.chargeHit = true;
      this._hit(ctx, a.damage);
    }
    this.x = clamp(this.x, this.arena.startX + this.def.w / 2, this.arena.endX - this.def.w / 2);
  }

  /* The charge commits: it picks a direction on the wind-up and does not
     steer, so it is dodged by moving, not by out-running it. Hitting a wall
     ends it early and leaves the boss exposed for longer, which is the
     reward for baiting it. */
  _charge(dt, ctx, p) {
    const a = BOSS_ATTACKS.charge;
    const speed = a.speed * this.speedMul;
    this.x += this.dir * speed * dt;
    ctx.particles.dust(this.x - this.dir * this.def.w / 2, WORLD.tierY[0]);
    if (this._overlaps(p) && !this.chargeHit) {
      this.chargeHit = true;
      this._hit(ctx, a.damage);
    }
    const min = this.arena.startX + this.margin;
    const max = this.arena.endX - this.margin;
    if (this.x <= min || this.x >= max) {
      this.x = clamp(this.x, min, max);
      ctx.audio.play('explosion');
      ctx.particles.debris(this.x + this.dir * this.def.w / 2, WORLD.tierY[0] - 10, 'A');
      // Stunned by its own momentum: a longer damage window.
      this._enter('recover', this.def.recover * 1.6);
    }
  }

  /* Relays orbit the node, and come back on their own timer once downed. The
     timer is the fight: three relays killed one at a time is three relays
     still alive, so they have to go down inside one respawn window. */
  _updateParts(dt, ctx) {
    if (!this.parts.length) return;
    const d = this.partDef;
    for (const q of this.parts) {
      if (d.layout === 'tiers') {
        q.x = this.x + q.off;
        q.y = WORLD.tierY[q.tier] - d.h / 2;
      } else {
        q.a += d.spin * this.speedMul * dt;
        q.x = this.x + Math.cos(q.a) * d.orbit;
        q.y = this.y + Math.sin(q.a) * d.rise;
      }
      q.flash = Math.max(0, q.flash - dt);
      // A respawn of zero means gone for good, not back next frame.
      if (!q.alive && d.respawn > 0) {
        q.respawnT -= dt;
        if (q.respawnT <= 0) {
          q.alive = true;
          q.hp = q.maxHp;
          ctx.audio.play('powerup');
          ctx.particles.sparkle && ctx.particles.sparkle(q.x, q.y, 'P');
        }
      }
    }
  }

  /* A line across the arena at the node's own height, held for a moment. The
     answer is to not be at that height. */
  _updateBeams(dt, ctx) {
    if (!this.beams.length) return;
    const a = BOSS_ATTACKS.beam;
    const p = ctx.player;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const bm = this.beams[i];
      bm.life -= dt;
      if (!bm.hit && Math.abs(p.midY - bm.y) < a.halfHeight) {
        bm.hit = true;
        this._hit(ctx, a.damage);
      }
      if (bm.life <= 0) this.beams.splice(i, 1);
    }
  }

  _wait(dt, ctx, p) {
    /* A boss in a sealed arena holds the far side of the player, always.

       It used to keep to whichever side it happened to be on, which soft-locked
       the fight: run to the far wall and it settles sixty pixels behind you,
       and a player who can only shoot the way they are facing — which under
       auto-run is always forwards — can never touch it again. It stood there
       and the fight stopped. Holding the far side means a forward-facing
       player can always reach it; the attacks that cross the player, like the
       charge, still cross it and then come back round.

       A gunship keeps station for its own reasons, handled in _updateFlight. */
    // Out of the hole. A perching boss spends its wait climbing back up, and
    // the climb is the fight's only quiet beat.
    this.embedded = false;
    const want = this.moving ? p.x + 90 : p.x + 60;
    const step = this.def.walkSpeed * this.speedMul * dt;
    if (Math.abs(want - this.x) > 4) this.x += Math.sign(want - this.x) * step;
    // A hovering boss also tracks the player's height, slowly, so it cannot be
    // parked on one tier and ignored. A moving one flies its own profile.
    if (this.def.float && !this.moving && !this.def.perch) {
      /* The floor of the hover has to put the beam through a player standing
         on the street rather than over their head. Their centre sits 11.5px
         above the deck and the beam reaches 9px either side of the node, so a
         node bottoming out 26px up missed a stationary target by five pixels.
         At 18 it crosses the chest, and a slide still ducks under it. */
      const wantY = clamp(p.midY, WORLD.tierY[2] - 4, WORLD.tierY[0] - 18);
      this.y += Math.sign(wantY - this.y) * Math.min(Math.abs(wantY - this.y), 16 * dt);
    }
    // A walker turns to face whoever it is fighting. A gunship escorting the
    // route faces the way it is flying, which also puts its exhaust — the only
    // part of it worth shooting — towards the player chasing it.
    this.dir = this.moving ? 1 : (p.x < this.x ? -1 : 1);
    this.x = clamp(this.x, this.arena.startX + this.margin, this.arena.endX - this.margin);

    if (this.phaseT <= 0) {
      const pool = this.attackPool;
      /* Most bosses roll their next attack, which keeps a stand-up fight from
         becoming a memorised sequence. A boss whose damage window belongs to
         one particular attack cycles instead: leaving that to chance means the
         same fight runs twenty seconds or forty-five depending on the dice,
         and a rhythm is what makes a boss learnable rather than survivable. */
      this.attack = this.cycles
        ? pool[this.atkIdx++ % pool.length]
        : pool[Math.floor(Math.random() * pool.length)];
      this._beginTelegraph(ctx, p);
      this._enter('telegraph', this.telegraphT);
      ctx.audio.play('turret.charge');
    }
  }

  /* Everything an attack has to decide *before* the wind-up rather than at
     the end of it, because the player is reading it for that whole second:
     where a dive is going to land, and which level a purge will spare. */
  _beginTelegraph(ctx, p) {
    if (this.attack === 'dive') {
      this.markX = clamp(p.x, this.arena.startX + this.def.w / 2,
                         this.arena.endX - this.def.w / 2);
      this.diveHit = false;
    }
    if (this.attack === 'overload') {
      this.charging = true;
      this.charge = 0;
      this.safeTier = this._safeTier(ctx);
    }
  }

  _strike(ctx, p) {
    const a = BOSS_ATTACKS[this.attack];
    switch (this.attack) {
      case 'stomp': {
        ctx.audio.play('explosion');
        this.lift = 2;              // land now, do not ease into it
        this.squash = 0.22;
        ctx.shake && ctx.shake(5);
        // Dust kicked out from under both feet rather than one puff in the
        // middle, so the slam reads as coming from the legs.
        for (const off of [-this.def.w * 0.28, this.def.w * 0.28]) {
          ctx.particles.dust(this.x + off, WORLD.tierY[0]);
          ctx.particles.debris(this.x + off, WORLD.tierY[0] - 2, 'S');
        }
        for (const dir of [-1, 1]) {
          this.waves.push({ x: this.x, dir, life: a.waveLife, hit: false,
                            dmg: a.damage, speed: a.waveSpeed });
        }
        if (a.collapse) this._collapse(ctx);
        this._enter('strike', 0.25);
        break;
      }
      case 'flak': {
        ctx.audio.play('enemy.fire');
        this.recoil = 4;
        for (let i = 0; i < a.shots; i++) {
          const spread = (i / (a.shots - 1) - 0.5) * 2 * a.spread;
          this.shots.push({
            x: this.x, y: this.y - this.def.h / 2,
            vx: this.dir * a.speed * (0.6 + Math.abs(spread)),
            vy: -150 - Math.random() * 40 + spread * 60,
            life: 3, dmg: a.damage,
          });
        }
        this._enter('strike', 0.3);
        break;
      }
      case 'charge': {
        ctx.audio.play('enemy.fire');
        this.chargeHit = false;
        this.dir = p.x < this.x ? -1 : 1;
        this._enter('strike', a.duration);
        break;
      }
      case 'chorus': {
        /* Each living pod fires down its own tier in turn. Silence one and the
           rotation is shorter, so the survivors come round faster — the fight
           speeds up as it gets smaller, which is the bargain. */
        ctx.audio.play('turret.charge');
        const live = this.parts.filter((q) => q.alive);
        const guns = live.length ? live : [{ x: this.x, y: this.y }];
        guns.forEach((q, i) => {
          this.shots.push({
            x: q.x, y: q.y,
            vx: (p.x < q.x ? -1 : 1) * a.speed, vy: 0,
            grav: 0, life: 2.4, dmg: a.damage, delay: i * a.gap,
          });
        });
        this._enter('strike', 0.2 + guns.length * a.gap);
        break;
      }
      case 'sweep': {
        // From the resonator, across everything at once.
        ctx.audio.play('enemy.fire');
        for (let i = 0; i < a.shots; i++) {
          const base = Math.atan2(p.midY - this.y, p.x - this.x);
          const ang = base + (i / (a.shots - 1) - 0.5) * a.arc;
          this.shots.push({
            x: this.x, y: this.y,
            vx: Math.cos(ang) * a.speed, vy: Math.sin(ang) * a.speed,
            grav: 0, life: 2.6, dmg: a.damage,
          });
        }
        this._enter('strike', 0.3);
        break;
      }
      case 'lunge': {
        /* It always overshoots. That is not a flaw in the attack, it is the
           attack: a player who can only shoot forwards has no answer to a
           thing behind them until it puts itself in front. */
        ctx.audio.play('enemy.die');
        this.chargeHit = false;
        this.dir = 1;
        this._enter('strike', a.duration);
        break;
      }
      case 'spit': {
        ctx.audio.play('enemy.fire');
        for (let i = 0; i < a.shots; i++) {
          const ang = Math.atan2(p.midY - this.y, p.x - this.x)
            + (i - (a.shots - 1) / 2) * a.spread;
          this.shots.push({
            x: this.x, y: this.y,
            vx: Math.cos(ang) * a.speed, vy: Math.sin(ang) * a.speed,
            grav: 0, life: 2.4, dmg: a.damage,
          });
        }
        this._enter('strike', 0.25);
        break;
      }
      case 'shockwave': {
        ctx.audio.play('explosion');
        ctx.shake && ctx.shake(4);
        for (const dir of [-1, 1]) {
          this.waves.push({ x: this.x, dir, life: a.waveLife, hit: false,
                            dmg: a.damage, speed: a.waveSpeed });
        }
        ctx.particles.dust(this.x, WORLD.tierY[0]);
        this._enter('strike', 0.25);
        break;
      }
      case 'strafe': {
        ctx.audio.play('drone.thrust');
        this.chargeHit = false;
        this.dir = p.x < this.x ? -1 : 1;
        this._enter('strike', a.duration);
        break;
      }
      case 'salvo': {
        ctx.audio.play('enemy.fire');
        this.recoil = 3;
        for (let i = 0; i < a.shots; i++) {
          const ang = Math.atan2(p.midY - this.y, p.x - this.x)
            + (i - (a.shots - 1) / 2) * a.spread;
          this.shots.push({
            x: this.x, y: this.y + this.def.h / 2,
            vx: Math.cos(ang) * a.speed, vy: Math.sin(ang) * a.speed,
            grav: 0, life: 2.6, dmg: a.damage,
          });
        }
        this._enter('strike', 0.3);
        break;
      }
      case 'mines': {
        // Dropped ahead of the player, on the ground they are about to run
        // over. The route is the second opponent in this fight and this is
        // what makes that true.
        ctx.audio.play('bomb.arm');
        for (let i = 0; i < a.count; i++) {
          this.shots.push({
            x: this.x + (i - (a.count - 1) / 2) * a.spacing,
            y: this.y + this.def.h / 2,
            vx: 0, vy: 40, grav: 1, life: 5, dmg: a.damage,
            blast: a.radius,
          });
        }
        this._enter('strike', 0.35);
        break;
      }
      case 'beam': {
        ctx.audio.play('boss.beam');
        this.beams.push({ y: this.y, life: a.life, hit: false });
        this._enter('strike', a.life);
        break;
      }
      case 'volley': {
        // Every living relay fires. Kill them and the node's own answer is
        // weaker, which is the reward for going after them first.
        ctx.audio.play('enemy.fire');
        const from = this.parts.filter((q) => q.alive);
        const guns = from.length ? from : [{ x: this.x, y: this.y }];
        for (const q of guns) {
          for (let i = 0; i < a.perRelay; i++) {
            const ang = Math.atan2(p.midY - q.y, p.x - q.x)
              + (i - (a.perRelay - 1) / 2) * a.spread;
            this.shots.push({
              x: q.x, y: q.y,
              vx: Math.cos(ang) * a.speed, vy: Math.sin(ang) * a.speed,
              grav: 0, life: 2.4, dmg: a.damage,
            });
          }
        }
        this._enter('strike', 0.3);
        break;
      }
      case 'guard': {
        // The slab comes up. Nothing gets through it and everything that
        // tries comes back — see deflect().
        ctx.audio.play('hit.shielded');
        this.guarding = true;
        this.returns = 0;
        this._enter('strike', a.duration);
        break;
      }
      case 'hammer': {
        /* One shell, on a fixed one-second arc, solved to land on the street
           exactly where the player is standing at the moment it is thrown.
           The flight time never changes, so the read never changes either:
           what kills you is the second you spend not moving. */
        ctx.audio.play('enemy.fire');
        this.recoil = 4;
        const street = WORLD.tierY[0];
        const y0 = this.y - this.def.h / 2;
        const t = a.flight;
        this.shots.push({
          x: this.x, y: y0,
          vx: (p.x - this.x) / t,
          vy: (street - y0 - 0.5 * WORLD.gravity * t * t) / t,
          grav: 1, life: t + 1.2, dmg: a.damage, blast: a.radius,
        });
        this._enter('strike', 0.3);
        break;
      }
      case 'dive': {
        // The fall itself is _dive; this only commits to it. The strike window
        // is generous because the landing, not the clock, is what ends it.
        ctx.audio.play('drone.thrust');
        this.diveHit = false;
        this._enter('strike', 3.0);
        break;
      }
      case 'rain': {
        // Shells walked across the player's own position from the ceiling.
        ctx.audio.play('bomb.arm');
        for (let i = 0; i < a.count; i++) {
          this.shots.push({
            x: p.x + (i - (a.count - 1) / 2) * a.spacing,
            y: this.y + this.def.h / 2,
            vx: 0, vy: 30, grav: 1, life: 6, dmg: a.damage, blast: a.radius,
          });
        }
        this._enter('strike', 0.35);
        break;
      }
      case 'hatch': {
        /* The bay opens. Nothing exotic comes out of it — these are the same
           scouts and bombers the track is full of, which is the joke: the
           carrier's whole threat is that it makes the ordinary fight happen
           inside the arena, and then eats whatever survives. */
        const bd = this.def.brood;
        const room = Math.max(0, bd.max - this.liveBrood);
        const n = Math.min(a.count, room);
        ctx.audio.play('powerup');
        for (let i = 0; i < n; i++) {
          const id = bd.types[Math.floor(Math.random() * bd.types.length)];
          const def = ENEMIES.find((e) => e.id === id) || ENEMIES[0];
          const id2 = ++Boss.broodSeq;
          const e = ctx.spawnEnemy && ctx.spawnEnemy({
            def, tier: ctx.player.tier, elite: false, broodId: id2,
            x: this.x + (i - (n - 1) / 2) * 24,
          });
          if (e) this.brood.push({ e, id: id2 });
        }
        ctx.particles.explode(this.x, this.y + this.def.h / 2, 0.7, 'P');
        this._enter('strike', 0.4);
        break;
      }
      case 'flood': {
        // The street, for four and a half seconds. It seals itself under it.
        ctx.audio.play('gadget.emp');
        ctx.shake && ctx.shake(5);
        this.flood = a.life;
        this.floodTick = 0;
        for (let i = 0; i < 6; i++) {
          ctx.particles.dust(this.x + (Math.random() - 0.5) * this.def.w, WORLD.tierY[0]);
        }
        this._enter('strike', 0.45);
        break;
      }
      case 'overload': {
        /* The wind-up is over: either enough damage landed on the engine and
           its capacitors to break the charge, or it did not. There is no
           partial credit — a meter that half-works is a meter nobody reads. */
        this.charging = false;
        if (this.charge >= a.need) {
          ctx.audio.play('explosion');
          ctx.shake && ctx.shake(7);
          ctx.particles.explode(this.x, this.y, 1.4, 'C');
          ctx.floater && ctx.floater(this.x, this.y - this.def.h / 2 - 8,
            'OVERLOAD BROKEN', 'Y', 1);
          // The longest window in the game, and the reward for going for it.
          this._enter('recover', this.def.recover * 2.4);
          break;
        }
        ctx.audio.play('boss.beam');
        ctx.shake && ctx.shake(10);
        this.purge = 0.55;
        if (p.tier !== this.safeTier) this._hit(ctx, a.damage);
        for (let i = 0; i < 8; i++) {
          ctx.particles.debris(this.x + (Math.random() - 0.5) * this.def.w * 2,
            this.y + (Math.random() - 0.5) * this.def.h, 'P');
        }
        this._enter('strike', 0.5);
        break;
      }
    }
  }

  /* The stomp takes a walkway ledge away, so the arena closes down over the
     course of the fight and the safe options run out. */
  _collapse(ctx) {
    const w = ctx.world;
    const cols = [];
    for (let c = this.arena.startCol; c <= this.arena.endCol; c++) {
      if (w.hasPlatform(c, 1) && !this.collapsed.includes(c)) cols.push(c);
    }
    if (!cols.length) return;
    // Take the run of ledge nearest the boss.
    const near = cols.reduce((a, b) =>
      Math.abs(w.xOfCol(b) - this.x) < Math.abs(w.xOfCol(a) - this.x) ? b : a);
    for (let c = near - 3; c <= near + 3; c++) {
      const col = w.col(c);
      if (col && col.p[1]) {
        col.p[1] = 0;
        this.collapsed.push(c);
        ctx.particles.dust(w.xOfCol(c), WORLD.tierY[1]);
      }
    }
    // A player standing on the piece that just went finds themselves falling,
    // which is the point — but they must not be left inside geometry.
    const p = ctx.player;
    if (p.tier === 1 && !w.hasPlatform(w.colOfX(p.x), 1)) p.grounded = false;
  }

  _updateWaves(dt, ctx) {
    const p = ctx.player;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wv = this.waves[i];
      wv.x += wv.dir * wv.speed * dt;
      wv.life -= dt;
      // Only catches a player on the ground: being airborne is the answer.
      if (!wv.hit && p.tier === 0 && p.grounded && Math.abs(p.x - wv.x) < 12) {
        wv.hit = true;
        this._hit(ctx, wv.dmg);
      }
      if (wv.life <= 0 || wv.x < this.arena.startX - 20 || wv.x > this.arena.endX + 20) {
        this.waves.splice(i, 1);
      }
    }
  }

  /* One list for everything a boss throws: arcing flak, relay fire and mines.
     Each shot carries its own damage and its own gravity, and a mine carries a
     blast radius as well — it is the landing that hurts, not the falling. */
  _updateShots(dt, ctx) {
    const p = ctx.player;
    const street = WORLD.tierY[0];
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      // Staggered fire: the Choir's pods take it in turns down one line, which
      // is what gives the rotation a gap to run through.
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.vy += WORLD.gravity * (s.grav === undefined ? 0.55 : s.grav) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      const dmg = s.dmg || BOSS_ATTACKS.flak.damage;
      if (s.blast) {
        if (s.y >= street - 2) {
          ctx.audio.play('explosion');
          ctx.particles.explode(s.x, street - 4, 0.9, 'A');
          ctx.shake && ctx.shake(3);
          if (Math.hypot(p.x - s.x, p.midY - (street - 8)) < s.blast) this._hit(ctx, dmg);
          this.shots.splice(i, 1);
          continue;
        }
      } else if (Math.abs(s.x - p.x) < 9 && Math.abs(s.y - p.midY) < 11) {
        this._hit(ctx, dmg);
        this.shots.splice(i, 1);
        continue;
      }
      if (s.life <= 0 || s.y > street + 8) {
        ctx.particles.dust(s.x, s.y);
        this.shots.splice(i, 1);
      }
    }
  }

  _dmgMul() { return 1 + this.pass * 0.2; }

  /* Every point of damage a boss deals goes through here.

     It has to be ctx.hurtPlayer and not ctx.onPlayerHit: the latter is only
     the notification that a hit happened, so calling it alone left every one
     of these attacks dealing exactly nothing. */
  _hit(ctx, amount) {
    return ctx.hurtPlayer ? ctx.hurtPlayer(amount * this._dmgMul(), 'boss') : 0;
  }

  _overlaps(p) {
    return Math.abs(p.x - this.x) < (this.def.w / 2 + 6)
        && Math.abs(p.midY - this.y) < (this.def.h / 2 + 8);
  }

  _debris(ctx) {
    ctx.particles.spawn(3, (q) => {
      q.x = this.x + (Math.random() - 0.5) * this.def.w;
      q.y = this.y + (Math.random() - 0.5) * this.def.h;
      q.vx = (Math.random() - 0.5) * 90;
      q.vy = -40 - Math.random() * 90;
      q.life = q.max = 0.5;
      q.colour = Math.random() < 0.5 ? 'A' : 'R';
      q.size = 1 + (Math.random() < 0.3 ? 1 : 0);
    });
  }
}

/* Every enemy a carrier has ever hatched gets a number, so a pooled slot that
   has since been recycled into somebody else's scout cannot be counted as one
   of its children. */
Boss.broodSeq = 0;

/* Which boss a gate uses, and how many times the roster has looped. */
export function bossForGate(gate) {
  const i = gate % BOSSES.length;
  return { def: BOSSES[i], pass: Math.floor(gate / BOSSES.length) };
}

/* Arena width in columns: as wide as the viewport, so a fixed camera can hold
   the whole fight without scrolling. */
export function arenaCols() {
  const cols = Math.round(WORLD.viewW / WORLD.metre) - SECTORS.arenaPadCols;
  return clamp(cols, SECTORS.arenaMinCols, SECTORS.arenaMaxCols);
}
