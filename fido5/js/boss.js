/* ==========================================================================
   FiDo-5 — Bosses.
   A boss is a sector gate: the camera stops, the walls come in, and the run
   does not continue until the thing in front of you is dead.

   The state machine is deliberately readable, because every attack has to be
   readable too. A boss that kills you without warning is a bug in a game
   whose whole first minute teaches you to watch for a telegraph.

   Lives are spent here and nowhere else — see Game._onDeath.
   ========================================================================== */

import { WORLD, BOSSES, BOSS_ATTACKS, SECTORS } from './data.js';
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
    this.armourOverride = null;
    this.attacksOverride = null;
    this.telegraphOverride = null;
    // A boss that hunts from behind has to arrive from behind, or it spends the
    // opening of the fight flying backwards past the player to take station.
    this.x = (def.station || 0) < 0
      ? arena.startX + this.margin + def.w / 2
      : arena.endX - this.margin - def.w / 2;
    this.y = this.moving ? this.cruiseY : WORLD.tierY[def.tier] - def.h / 2;
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
  }

  /* A boss with parts is exposed when every one of them is down; a boss
     without them is exposed in the moment after it attacks. Two different
     fights, one word for "hit it now". */
  get exposed() {
    const pd = this.partDef;
    // Parts only gate exposure where the design says they do: Hexcell's relays
    // are a shield, the Choir's pods are plating and Null Prime's drones are
    // just company.
    if (this.parts.length && pd && pd.gates !== false) return this.parts.every((q) => !q.alive);
    return this.phase === 'recover';
  }
  get liveParts() { return this.parts.reduce((n, q) => n + (q.alive ? 1 : 0), 0); }
  get partDef() { return this.phase2 && this.def.phase2.parts ? this.def.phase2.parts : this.def.parts; }

  /* A boss that changes form part-way through overrides these three rather
     than being a second definition: same body, same bar, different rules. */
  get armourVal() { return this.armourOverride == null ? this.def.armour : this.armourOverride; }
  get attackPool() { return this.attacksOverride || this.def.attacks; }
  get telegraphT() { return this.telegraphOverride == null ? this.def.telegraph : this.telegraphOverride; }

  /* How far from a wall the body has to stay. A boss with orbiting parts needs
     room for them too, or a relay spends the fight outside the arena where it
     cannot be shot. */
  /* How far from a wall the body has to stay. Orbiting parts need room on
     both sides; mounted ones trail back towards the player, so they need none
     on the far side — which is what lets an immobile boss stand against the
     far wall with nothing behind it for the player to hide in. */
  get margin() {
    const pd = this.def.parts;
    if (!pd) return this.def.w / 2;
    return this.def.w / 2 + (pd.layout === 'tiers' ? pd.w / 2 : pd.orbit);
  }
  get hpFrac() { return this.maxHp > 0 ? clamp(this.hp / this.maxHp, 0, 1) : 0; }

  /* ---- Damage --------------------------------------------------------- */

  /* The damage multiplier a hit would actually get right now. One place, so
     the bar can never claim a boss is protected while the maths says it is
     taking everything. */
  get armourNow() {
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
    if (this.hp <= 0) this._die(ctx);
    else if (this.def.phase2 && !this.phase2 && this.hp <= this.maxHp * this.def.phase2.at) {
      this._shed(ctx);
    }
    return dealt;
  }

  /* Half health, and it throws the armour away. Everything about it changes at
     once — that is the point of a second phase, and it has to be loud. */
  _shed(ctx) {
    const p2 = this.def.phase2;
    this.phase2 = true;
    this.armourOverride = p2.armour;
    this.attacksOverride = p2.attacks;
    this.telegraphOverride = p2.telegraph;
    this.speedMul *= p2.speedMul || 1;
    this.atkIdx = 0;
    if (p2.parts) this._buildParts(p2.parts);
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

    this._updateAnim(dt);
    this._updateWaves(dt, ctx);
    this._updateShots(dt, ctx);
    this._updateBeams(dt, ctx);
    this._updateParts(dt, ctx);

    this.phaseT -= dt;
    switch (this.phase) {
      case 'wait':      this._wait(dt, ctx, p); break;
      case 'telegraph': if (this.phaseT <= 0) this._strike(ctx, p); break;
      case 'strike':
        if (this.attack === 'charge') this._charge(dt, ctx, p);
        if (this.attack === 'strafe' || this.attack === 'lunge') this._strafe(dt, ctx, p);
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

  _enter(phase, time) { this.phase = phase; this.phaseT = time; }

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
    const want = this.moving ? p.x + 90 : p.x + 60;
    const step = this.def.walkSpeed * this.speedMul * dt;
    if (Math.abs(want - this.x) > 4) this.x += Math.sign(want - this.x) * step;
    // A hovering boss also tracks the player's height, slowly, so it cannot be
    // parked on one tier and ignored. A moving one flies its own profile.
    if (this.def.float && !this.moving) {
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
      this.attack = this.def.cycleAttacks
        ? pool[this.atkIdx++ % pool.length]
        : pool[Math.floor(Math.random() * pool.length)];
      this._enter('telegraph', this.telegraphT);
      ctx.audio.play('turret.charge');
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
