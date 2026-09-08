/* ==========================================================================
   FiDo-5 — The operative.
   Owns movement, the tier the player is standing on, collision with the world
   and the health / shield / energy pools. Shooting is triggered from here but
   resolved in combat.js.

   Movement model: forward motion is automatic. Jumping climbs one level and
   platforms are one-way, so a jump from the street lands on the walkway
   rather than passing through it. Pressing down slides on the street and
   drops through a platform when there is one above the street.
   ========================================================================== */

import { WORLD } from './data.js';

const STAND_W = 11, STAND_H = 23;   // body 15 + legs 9, overlapping by one row
const SLIDE_W = 18, SLIDE_H = 13;
const COYOTE = 0.10;          // grace period after running off an edge
const DROP_IGNORE = 0.22;     // s of pass-through after dropping down
const BLOCK_H = 24;           // full-height barrier: taller than the operative
const LOW_TOP = 28, LOW_H = 13; // low bar leaving 15px of air: slide height only

export class Player {
  constructor(stats) {
    this.reset(stats);
  }

  reset(stats) {
    this.stats = stats;
    this.x = 60;
    this.tier = 0;
    this.y = WORLD.tierY[0];
    this.vy = 0;
    this.grounded = true;
    this.state = 'run';
    this.anim = 0;
    this.frame = 0;
    this.coyote = 0;
    this.dropIgnore = 0;
    this.slideT = 0;
    this.nudge = 0;              // screen-space drift the player controls

    this.maxHealth = stats.operative.maxHealth;
    this.health = this.maxHealth;
    this.shield = stats.operative.startShield;
    this.maxShield = Math.max(stats.operative.startShield, stats.drone.shieldStrength);
    this.energyMax = stats.operative.energyMax;
    this.energy = this.energyMax;

    this.invuln = 0;
    this.hurtFlash = 0;
    this.fireCool = 0;
    this.firing = false;
    this.recoil = 0;
    this.dead = false;
    this.deathT = 0;
    this.rescueT = 0;
    this.landedThisFrame = false;
    this.hitThisFrame = null;
    this.airTime = 0;
    this.maxTierThisChunk = 0;
  }

  /* ---- Geometry ---- */

  get w() { return this.state === 'slide' ? SLIDE_W : STAND_W; }
  get h() { return this.state === 'slide' ? SLIDE_H : STAND_H; }
  get left() { return this.x - this.w / 2; }
  get right() { return this.x + this.w / 2; }
  get top() { return this.y - this.h; }
  get bottom() { return this.y; }
  get midY() { return this.y - this.h / 2; }

  /* Where the muzzle sits, for tracers and flashes. */
  muzzle() {
    if (this.state === 'slide') return { x: this.x + 9, y: this.y - 5 };
    return { x: this.x + 7 - this.recoil * 2, y: this.y - 13 };
  }

  /* ---- Input ---- */

  tryJump(audio) {
    if (this.dead || this.state === 'rescue') return false;
    if (!this.grounded && this.coyote <= 0) return false;
    this.grounded = false;
    this.coyote = 0;
    this.vy = WORLD.jumpVel;
    this.state = 'air';
    this.slideT = 0;
    this.airTime = 0;
    if (audio) audio.play('jump');
    return true;
  }

  tryDown(world, audio) {
    if (this.dead || this.state === 'rescue') return false;
    if (!this.grounded) {
      // Fast-fall, and slide on landing.
      this.vy = Math.max(this.vy, 165);
      this.wantSlide = true;
      return true;
    }
    const col = world.colOfX(this.x);
    // Drop through to a lower level when one exists below.
    if (this.tier > 0) {
      for (let t = this.tier - 1; t >= 0; t--) {
        if (world.hasPlatform(col, t)) {
          this.grounded = false;
          this.state = 'air';
          this.vy = 44;
          this.dropIgnore = DROP_IGNORE;
          this.tier = t;
          if (audio) audio.play('slide');
          return true;
        }
      }
    }
    // Otherwise slide.
    if (this.state !== 'slide') {
      this.state = 'slide';
      this.slideT = WORLD.slideTime;
      if (audio) audio.play('slide');
    } else {
      this.slideT = WORLD.slideTime;   // extend
    }
    return true;
  }

  /* ---- Simulation ---- */

  update(dt, world, speed, input, audio, particles) {
    this.landedThisFrame = false;
    this.hitThisFrame = null;

    if (this.dead) {
      this.deathT += dt;
      // Keep falling so the body settles rather than freezing mid-air.
      this.vy += WORLD.gravity * dt;
      this.y = Math.min(this.y + this.vy * dt, WORLD.tierY[this.tier]);
      return;
    }

    if (this.state === 'rescue') {
      this.rescueT -= dt;
      if (this.rescueT <= 0) {
        this.state = this.grounded ? 'run' : 'air';
      }
      // The world still moves during a rescue, just slowly (game.js scales dt).
    }

    // Timers ---------------------------------------------------------------
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.dropIgnore = Math.max(0, this.dropIgnore - dt);
    this.fireCool = Math.max(0, this.fireCool - dt);
    this.recoil = Math.max(0, this.recoil - dt * 8);

    // Energy regenerates whether or not the trigger is held.
    const regen = this.stats.operative.energyRegen * (this.firing ? 0.75 : 1.25);
    this.energy = Math.min(this.energyMax, this.energy + regen * dt);

    // Horizontal -----------------------------------------------------------
    let vx = speed;
    if (input) {
      if (input.held.forward) this.nudge = Math.min(WORLD.nudgeRange, this.nudge + WORLD.nudge * dt * 2.4);
      else if (input.held.back) this.nudge = Math.max(-WORLD.nudgeRange, this.nudge - WORLD.nudge * dt * 2.4);
      else this.nudge += (0 - this.nudge) * Math.min(1, dt * 3.4);
    }
    this.x += vx * dt;

    // Slide timer ----------------------------------------------------------
    if (this.state === 'slide') {
      this.slideT -= dt;
      const stillHeld = input && input.held.down;
      if (this.slideT <= 0 && !stillHeld) this.state = 'run';
      else if (this.slideT <= 0 && stillHeld) this.slideT = 0.12;   // hold to keep sliding
    }

    // Vertical -------------------------------------------------------------
    if (!this.grounded) {
      this.airTime += dt;
      // Jump height is fixed. A swipe cannot be held the way a key can, so
      // variable height would make the same jump behave differently per device.
      let g = WORLD.gravity;
      if (this.vy > 0) g *= 1.12;          // snappier descent
      this.vy += g * dt;
      const prevY = this.y;
      this.y += this.vy * dt;
      this.state = this.state === 'rescue' ? 'rescue' : 'air';

      // Land on the first surface crossed while descending.
      if (this.vy > 0 && this.dropIgnore <= 0) {
        const col = world.colOfX(this.x);
        for (let t = WORLD.tierCount - 1; t >= 0; t--) {
          const surface = WORLD.tierY[t];
          if (prevY <= surface && this.y >= surface && world.hasPlatform(col, t)) {
            this.y = surface;
            this.vy = 0;
            this.grounded = true;
            this.tier = t;
            this.landedThisFrame = true;
            this.state = this.wantSlide ? 'slide' : 'run';
            if (this.wantSlide) { this.slideT = WORLD.slideTime; this.wantSlide = false; }
            if (audio) audio.play('land');
            if (particles) particles.dust(this.x, this.y);
            break;
          }
        }
      }

      // Fell past the street with no platform under: that is a pit.
      if (this.y > WORLD.tierY[0] + 26) {
        this.die('pit');
        return;
      }
    } else {
      // Standing: check the ground is still there.
      const col = world.colOfX(this.x);
      if (!world.hasPlatform(col, this.tier)) {
        this.grounded = false;
        this.coyote = COYOTE;
        this.state = 'air';
        this.vy = 14;
      }
      this.y = WORLD.tierY[this.tier];
    }

    this.maxTierThisChunk = Math.max(this.maxTierThisChunk, this.tier);

    // Obstacles ------------------------------------------------------------
    this._collideObstacles(world, audio, particles);

    // Animation ------------------------------------------------------------
    this.anim += dt * (this.grounded && this.state === 'run' ? (6 + speed / 40) : 6);
    this.frame = Math.floor(this.anim) % 4;
  }

  _collideObstacles(world, audio, particles) {
    if (this.invuln > 0 || this.dead) return;
    const M = WORLD.metre;
    const c0 = world.colOfX(this.left);
    const c1 = world.colOfX(this.right);
    for (let c = c0; c <= c1; c++) {
      for (let t = 0; t < WORLD.tierCount; t++) {
        const kind = world.obstacleAt(c, t);
        if (!kind) continue;
        const surface = WORLD.tierY[t];
        const bx = c * M, bw = M;
        let by, bh;
        if (kind === 1) { by = surface - BLOCK_H; bh = BLOCK_H; }
        else { by = surface - LOW_TOP; bh = LOW_H; }
        if (this.right <= bx || this.left >= bx + bw) continue;
        if (this.bottom <= by || this.top >= by + bh) continue;
        // Overlap: this is a hit.
        this.hitThisFrame = kind === 1 ? 'block' : 'low';
        this.hurt(kind === 1 ? 16 : 12, audio, particles, 'obstacle');
        // Push clear so the player is not ground down by the same barrier.
        this.x = bx - this.w / 2 - 1;
        this.nudge = Math.max(-WORLD.nudgeRange, this.nudge - 14);
        return;
      }
    }
  }

  /* ---- Damage ---- */

  /* Returns the damage actually taken. `lethal` tells the caller a rescue is
     needed; the caller (game.js) decides whether FiDo-5 can provide one. */
  hurt(amount, audio, particles, source) {
    if (this.dead || this.invuln > 0 || this.state === 'rescue') return 0;
    if (this.powerInvuln) {
      if (audio) audio.play('shield.hit');
      if (particles) particles.shieldRing(this.x, this.midY, 'C');
      return 0;
    }
    let left = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, left);
      this.shield -= absorbed;
      left -= absorbed;
      if (audio) audio.play('shield.hit');
      if (particles) particles.shieldRing(this.x, this.midY, 'P');
    }
    if (left > 0) {
      this.health -= left;
      this.hurtFlash = 0.35;
      this.invuln = this.stats.operative.invulnAfterHit;
      if (audio) audio.play('damage');
      if (particles) particles.impact(this.x, this.midY, 'R');
    }
    return amount;
  }

  /* True when the player is about to die and could be saved. */
  isLethal() { return this.health <= 0 && !this.dead; }

  applyRescue(heal, shield, invulnTime, duration) {
    this.health = Math.max(1, heal);
    this.shield = Math.max(this.shield, shield);
    this.maxShield = Math.max(this.maxShield, shield);
    this.invuln = invulnTime;
    this.state = 'rescue';
    this.rescueT = duration;
    this.hurtFlash = 0;
  }

  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); }
  addShield(n) {
    this.shield += n;
    this.maxShield = Math.max(this.maxShield, this.shield);
  }
  addEnergy(n) { this.energy = Math.min(this.energyMax, this.energy + n); }

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.state = 'dead';
    this.deathT = 0;
    this.cause = cause || 'damage';
    this.health = 0;
    this.vy = cause === 'pit' ? 140 : -124;
  }
}
